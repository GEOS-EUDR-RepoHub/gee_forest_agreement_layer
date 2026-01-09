////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/*
 FOREST AGREEMENT LAYER - GEODATA                                                                                                        //
 Version: 1.0 (12.12.2025)                                                                                                              //    
 Data Input: Geodata of Production Polygons or Points                                                                                  //  
 Repository: https://github.com/GEOS-EUDR/gee_forest_agreement_layer                                                                  //
 Summary of Script: Generates a forest agreement layer over user-defined polygons or points.                                         //
 Walks through data prep, reclassification, agreement calculation, cluster-based exports,                                           //
 and forest extent summaries. The script includes a user section for setting parameters                                            //
 and an automated section that handles all processing steps.                                                                      //
 Copyright © 2025 Thünen-Institute, Juliana Freitas Beyer, Margret Köthke, Melvin Lippe                                          //
---------------------------------------------------------------                                                                 //
 New to Google Earth Engine (GEE) API scripting?                                                                               //    
 Please check introduction tutorials: https://developers.google.com/earth-engine/tutorials/tutorial_api_01                    //
 */
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


/////////////////////////////////////////
// PART 0: USER-DEFINED CONSTANTS
////////////////////////////////////////

var TARGET_RESOLUTION = 30;       // meters (final/full-res)
var SIEVE_THRESHOLD_PIXELS = 6;   // pixels for filtering out (6 pixels ~0.5 ha at 30m), minimum mapping unit
var FOREST_HEIGHT_MIN = 5;        // meters
var AGREEMENT_RADIUS = 1;         // pixels for focalMode filter. When value is "1", the filter looks at a 3×3 neighborhood (1 pixel in every direction → center + 8 surrounding pixels)


///////////////////////////////////////
// PART 0A: INPUT SETTINGS (LOAD DATA)
///////////////////////////////////////

// Upload your production polygons or point data into Earth Engine Assets.
// Supported formats: SHP, KML/KMZ, GeoJSON, or CSV with geometry.
// More info: https://developers.google.com/earth-engine/guides/manage_assets

// 1. Choose the type of input geodata.
//    'Polygon' = polygons are used directly.
//    'Point'   = each point will be buffered to create a polygon-like area.
var GEODATA_TYPE = 'Polygon';   // Options: 'Polygon' or 'Point'

// 2. Buffer radius (meters). Used ONLY when GEODATA_TYPE = 'Point', is created automatically.
//    Here you just need to set your minimum targeted area
var BUFFER_HA = 0.6; // Recommended minimum size should be greater than 0.5 ha, based on the FAO forest definition, which uses 0.5 ha as the minimum mapping unit.
                    

// 3. Specify the path to the geodata stored in Assets.
var SHAPEFILE_PATH = 'projects/ee-yourusername/assets/your_geodata_here'; // <-- Replace with your username and asset name


///////////////////////////////////////
// PART 0B: OUTPUT SETTINGS (EXPORT)
///////////////////////////////////////
// More info: https://developers.google.com/earth-engine/guides/exporting

// 1. Choose where the forest-agreement layer will be exported.
//    'Drive' → saves the file to your Google Drive
//    'Asset' → saves the file to your Earth Engine Assets (shown in the left panel)
var EXPORT_TARGET = 'Drive';   // Options: 'Drive' or 'Dsset'


// 2. Settings used ONLY when EXPORT_TARGET = 'Asset'
//    Provide the EE asset ID where the export should be saved.
var EXPORT_ASSET_ID = 'users/your_username/ForestAgreement_2020';
// <-- Replace with your EE username and desired asset name

// 3. Settings used ONLY when EXPORT_TARGET = 'Drive'
//    These fields define the Drive folder and file description.
var EXPORT_FOLDER = 'ForestAgreementExports';
var EXPORT_DESCRIPTION = 'ForestAgreement_2020';

// 4. File format of the exported output.
//    Options: 'SHP', 'KML', 'KMZ', 'GeoJSON'
var EXPORT_FORMAT = 'SHP';







////// ----------- From this point onward, the script runs AUTOMATICALLY ------------ //////

///////////////////////////////////////
// PART 1: DEFINED REGION OF INTEREST 
///////////////////////////////////////


// CHECK: placeholder
if (SHAPEFILE_PATH.indexOf('your_geodata_here') !== -1) {
  throw new Error(
    'ERROR: Please specify your shapefile from uploaded to "assets" by setting the variable SHAPEFILE_PATH before running the script.'
  );
}

// CHECK: Geodata type consistency
var shp_data = ee.FeatureCollection(SHAPEFILE_PATH);
var firstFeature = shp_data.first();
var actualType = firstFeature.geometry().type().getInfo();

if (actualType !== GEODATA_TYPE) {
  throw new Error(
    'ERROR: GEODATA_TYPE does not match the shapefile geometry.\n' +
    'Selected: ' + GEODATA_TYPE + ', Actual: ' + actualType
  );
}



// Function to buffer points by 0.5 ha
var bufferPoints = function(fc) {
  var buffer_m2 = BUFFER_HA * 10000; // ha -> m²
  var buffer_radius_m = Math.sqrt(buffer_m2 / Math.PI);
  print('Buffer radius in meters:', buffer_radius_m);
  print('Buffer radius in pixels:', buffer_radius_m / TARGET_RESOLUTION);
  
  return fc.map(function(f) {
    return f.buffer(buffer_radius_m);
  });
};

// Function to create cluster bounding boxes
var clusterBoundingBoxes = function(fc) {
  // Merge nearby features 
  var unioned = fc.map(function(f) {
    return f.buffer(10000); // buffer to join nearby features
  }).union().geometry(); // returns a single ee.Geometry
  var clusterGeoms = ee.List(unioned.geometries());
  return ee.FeatureCollection(
    clusterGeoms.map(function(g){
      return ee.Feature(ee.Geometry(g).bounds());
    })
  );
};

// Workflow based on GEODATA_TYPE
var inputForClustering;
if (GEODATA_TYPE === 'Point') {
  // Step 1: buffer points
  var bufferedPoints = bufferPoints(shp_data);
  inputForClustering = bufferedPoints;
} else if (GEODATA_TYPE === 'Polygon') {
  inputForClustering = shp_data;
} else {
  throw 'GEODATA_TYPE must be either "Point" or "Polygon"';
}

// Step 2: cluster bounding boxes
var clusterBoundsFC = clusterBoundingBoxes(inputForClustering);

// All clusters combined as ROI for loading datasets
var roi = clusterBoundsFC.geometry();

// Changes the shp_data to use the buffered points
if (GEODATA_TYPE === 'Point') { 
  shp_data = bufferedPoints;
}




///////////////////////////////////////
// PART 2: FOREST CLASS DEFINITIONS
///////////////////////////////////////

var forestClasses = {
  'JRC': ee.List([1]),
  'ESRI_LULC': ee.List([2]),
  'DynamicWorld': ee.List([1]),
  'GLCFCS30D': ee.List([51,52,61,62,71,72,81,82,91,92]),
  'GLC10': ee.List([20]),
  'GLCLU': ee.List([1,3,4]),
  'PALSAR': ee.List([1,2]),
  'GFT': ee.List([1,10]),
  'ETH': ee.List.sequence(FOREST_HEIGHT_MIN, 255)
};

///////////////////////////////////////
// PART 3: FUNCTIONS
///////////////////////////////////////

// Binary forest/non-forest reclassification
function reclassifyImage(image, classes) {
  return image.remap(classes, ee.List.repeat(1, classes.length()), 0)
              .unmask(0)
              .rename('Landcover');
}

// Reproject and resample (done prior to bitwise operations)
function reprojectAndResample(image) {
  return image
    .reproject({crs: 'EPSG:4326', scale: TARGET_RESOLUTION})
    .resample()
    ;
}

// Filter and mosaic 
function filterAndMosaic(collectionId, startDate, endDate) {
  var c = ee.ImageCollection(collectionId).filterBounds(roi);
  if (startDate && endDate) c = c.filterDate(startDate, endDate);
  var m = c.mosaic();
  return m.clip(roi);
}

///////////////////////////////////////
// PART 4: LOAD DATASETS
///////////////////////////////////////
// Each dataset clipped to ROI 

// JRC (10m) 2020 [Bourgoin et al., 2024]
var jrc_2020 = filterAndMosaic("JRC/GFC2020/V2").clip(roi);

// ESRI-LULC (10m) 2020 [Karra et al. 2021]
var esri_lulc_2020 = filterAndMosaic("projects/sat-io/open-datasets/landcover/ESRI_Global-LULC_10m_TS",
                                     '2020-01-01','2020-12-31').clip(roi);

// Dynamic World (10m) 2020 [Brown et al. 2022]                                     
var dw_mode = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1')
  .filterBounds(roi).filterDate('2020-01-01','2020-12-31')
  .select('label').reduce(ee.Reducer.mode()).clip(roi);

// GLC-FCS30D Global Land Cover (30m) 2020 [Liu et al. 2020]  
var GLCFCS30D_2020 = ee.ImageCollection("projects/sat-io/open-datasets/GLC-FCS30D/annual")
  .select('b21').filterBounds(roi).reduce(ee.Reducer.mean()).clip(roi);

// FROM-GLC10 (10m) 2017 [Gong et al. 2019]  
var GLC10_2017 = filterAndMosaic("projects/sat-io/open-datasets/FROM-GLC10");

// GLCLUC2020 - Forest Extent 2020 [Potapov et al., 2022]
var landmask = ee.Image("projects/glad/OceanMask").lte(1);
var GLCLU_2020 = ee.Image('projects/glad/GLCLU2020/Forest_type')
  .clip(roi).updateMask(landmask);

// Global 4-class PALSAR-2 (25m) 2020 [Shimada et al. 2014]  
var jaxa_2020 = filterAndMosaic('JAXA/ALOS/PALSAR/YEARLY/FNF4','2020-01-01').clip(roi);

// Global Canopy height (10m) 2020 [Lang et al., 2023]
var ETH_2020 = ee.Image('users/nlang/ETH_GlobalCanopyHeight_2020_10m_v1').clip(roi);

// Global Forest Types (10m) 2020, v0 [Bourgoin et al., 2024]
var GFT2020 = filterAndMosaic('JRC/GFC2020_subtypes/V0');
// 1 - Naturally regenerating forest
// 10 - Primary forest
// 20 - Planted/Plantation forest


///////////////////////////////////////////
// PART 5: RECLASSIFICATION + REPROJECTION
//////////////////////////////////////////

var reclassifiedList = [
  reprojectAndResample(reclassifyImage(jrc_2020, forestClasses['JRC'])),
  reprojectAndResample(reclassifyImage(esri_lulc_2020, forestClasses['ESRI_LULC'])),
  reprojectAndResample(reclassifyImage(dw_mode, forestClasses['DynamicWorld'])),
  reprojectAndResample(reclassifyImage(GLCFCS30D_2020, forestClasses['GLCFCS30D'])),
  reprojectAndResample(reclassifyImage(GLC10_2017, forestClasses['GLC10'])),
  reprojectAndResample(reclassifyImage(GLCLU_2020, forestClasses['GLCLU'])),
  reprojectAndResample(reclassifyImage(jaxa_2020, forestClasses['PALSAR'])),
  reprojectAndResample(reclassifyImage(ETH_2020, forestClasses['ETH'])),
  reprojectAndResample(reclassifyImage(GFT2020, forestClasses['GFT'])) 
];


/////////////////////////////////////////////
// PART 6: FOREST AGREEMENT LAYER (FULL ROI)
////////////////////////////////////////////

// Combine all 9 reclassified forest masks
var forestAgreement = ee.ImageCollection(reclassifiedList)
  .reduce(ee.Reducer.sum())
  .rename('agreement')
  ;

// Filter out small patches and reassign
var smallPatches = forestAgreement.connectedPixelCount(8).lt(SIEVE_THRESHOLD_PIXELS);
var majorityClass = forestAgreement.focalMode(AGREEMENT_RADIUS, 'square', 'pixels');
var forestAgreementFiltered = forestAgreement.where(smallPatches, majorityClass).clip(roi);


///////////////////////////////////////
// PART 7: VISUALIZATION OF CLUSTER
///////////////////////////////////////
// To prevent memory overload, the user can visualize only one cluster, the first (in case of multiple polygons spread out through certain landscape)

var visParams = {
  min: 0,
  max: 9,
  palette: ['#D3D3D3', '#FF0000', '#F08080', '#FFA500', '#FFD580',
            '#FFFF00', '#CCCC00', '#90EE90', '#32CD32', '#006400']
};

// --- 1️⃣ Visualize cluster, shapefile polygons, and both forest agreement versions ---
clusterBoundsFC.evaluate(function(fc){
  if (fc.features.length > 0) {
    var firstCluster = ee.Feature(fc.features[0]);
    var clusterGeom = firstCluster.geometry();
    var forestRawClip = forestAgreement.clip(clusterGeom);
    var forestFilteredClip = forestAgreementFiltered.clip(clusterGeom);
    Map.centerObject(clusterGeom, 12);
    
    Map.addLayer(forestRawClip, visParams, 'Forest Agreement (Raw) - Cluster 1');
    Map.addLayer(forestFilteredClip, visParams, 'Forest Agreement (Filtered) - Cluster 1');
    Map.addLayer(clusterBoundsFC.style({
      color: 'black',
      fillColor: '00000000',
      width: 2
    }), {}, 'Cluster Boundaries');
    Map.addLayer(shp_data.style({
      color: 'purple',
      fillColor: '00000000',
      width: 1.5
    }), {}, 'Original Polygons');
  }
});

// --- Legend UI ---
var legend = ui.Panel({
  style: {position: 'bottom-left', padding: '8px 15px'}
});
legend.add(ui.Label({
  value: 'Legend: Forest Agreement',
  style: {fontWeight: 'bold', fontSize: '16px'}
}));

var labels = ['0 maps', '1 map', '2 maps', '3 maps', '4 maps',
              '5 maps', '6 maps', '7 maps', '8 maps', '9 maps'];

var palette = ['#D3D3D3', '#FF0000', '#F08080', '#FFA500', '#FFD580',
               '#FFFF00', '#CCCC00', '#90EE90', '#32CD32', '#006400'];

var makeRow = function(color, name) {
  return ui.Panel({
    widgets: [
      ui.Label({style: {backgroundColor: color, padding: '8px', margin: '0 0 4px 0'}}),
      ui.Label({value: name, style: {margin: '0 0 4px 6px'}})
    ],
    layout: ui.Panel.Layout.Flow('horizontal')
  });
};

// Add all legend rows
for (var i = 0; i < palette.length; i++) {
  legend.add(makeRow(palette[i], labels[i]));
}
Map.add(legend);


////////////////////////////////////////////////////////
// PART 8: EXPORT FUNCTION (per cluster, with UTM zone)
///////////////////////////////////////////////////////


// Compute best-fit UTM EPSG for given geometry
function getUTMEPSG(geometry) {
  var centroid = geometry.centroid(ee.ErrorMargin(1));
  var lon = ee.Number(centroid.coordinates().get(0));
  var lat = ee.Number(centroid.coordinates().get(1));
  var utmZone = lon.add(180).divide(6).floor().add(1);
  var epsg = ee.Algorithms.If(
    lat.gt(0),
    ee.String('EPSG:326').cat(utmZone.format('%02d')),
    ee.String('EPSG:327').cat(utmZone.format('%02d'))
  );
  return ee.String(epsg);
}

// Main export function per cluster
function exportClusterGeoTIFF(image, clusterFeature, clusterIndex) {
  var geom = clusterFeature.geometry();
  var clipped = image.clip(geom).toInt16(); 
  var clusterName = 'Cluster_' + (clusterIndex + 1);
  var descriptionDrive = EXPORT_DESCRIPTION + '_' + clusterName + '_Drive';
  var descriptionAsset = EXPORT_DESCRIPTION + '_' + clusterName + '_Asset';
  var assetId = EXPORT_ASSET_ID + '_' + clusterName;

  // Compute proper UTM CRS for this cluster
  var epsg = getUTMEPSG(geom);

  // Check if cluster contains any valid pixels
  var pixelCount = clipped.reduceRegion({
    reducer: ee.Reducer.count(),
    geometry: geom,
    scale: TARGET_RESOLUTION,
    maxPixels: 1e13
  }).values().get(0);

  // Evaluate pixel count client-side before exporting
  ee.Number(pixelCount).evaluate(function(count) {
    if (count && count > 0) {
      epsg.evaluate(function(epsgStr) {
        print('✅ Exporting', clusterName, 'with', count, 'pixels at', epsgStr);

        if (EXPORT_TARGET === 'Drive') {
          // === Option: Export to Google Drive ===
          Export.image.toDrive({
            image: clipped,
            description: descriptionDrive,
            folder: EXPORT_FOLDER,
            fileNamePrefix: descriptionDrive,
            region: geom,
            scale: TARGET_RESOLUTION,
            crs: epsgStr,
            maxPixels: 1e13,
            formatOptions: {
              cloudOptimized: true
            }
          });

        } else if (EXPORT_TARGET === 'Asset') {
          
          // === Option: Export to Earth Engine Asset ===
          Export.image.toAsset({
            image: clipped,
            description: descriptionAsset,
            assetId: assetId,
            region: geom,
            scale: TARGET_RESOLUTION,
            crs: epsgStr,
            maxPixels: 1e13
          });
        }
        
      });
        
    } else {
      print('⚠️ Skipping', clusterName, '- no valid pixels found.');
    }
  });
}



// --- Trigger exports for all clusters ---
clusterBoundsFC.evaluate(function(fc) {
  fc.features.forEach(function(f, i) {
    exportClusterGeoTIFF(forestAgreementFiltered, ee.Feature(f), i);
  });
});



/////////////////////////////////////////////////////////////
// PART 9: FOREST EXTENT SUMMARY (over all geodata-polygons)
////////////////////////////////////////////////////////////
// This section computes the forest extent based on all GEODATA polygons (shapefile), NOT the clusters

var forestLayers = [
  {name: 'JRC',        image: reclassifiedList[0]},
  {name: 'ESRI-10m',   image: reclassifiedList[1]},
  {name: 'DynamicWorld', image: reclassifiedList[2]},
  {name: 'GLC-FCS30D',  image: reclassifiedList[3]},
  {name: 'FROM-GLC10',   image: reclassifiedList[4]},
  {name: 'GLCLU2020',    image: reclassifiedList[5]},
  {name: 'PALSAR-2 FNF', image: reclassifiedList[6]},
  {name: 'ETH',          image: reclassifiedList[7]},
  {name: 'GFT',          image: reclassifiedList[8]}
];

// Compute total ROI area (ha)
var shpAreaHa = ee.Image.pixelArea().divide(10000)
  .reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: shp_data,
    scale: TARGET_RESOLUTION,
    maxPixels: 1e13
  })
  .getNumber('area');


// Compute forest area + forest % for each dataset
var statsList = forestLayers.map(function(layer) {
  var forestMask = layer.image.eq(1);
  var areaImage = ee.Image.pixelArea()
    .divide(10000)
    .updateMask(forestMask);
  var forestAreaHa = areaImage.reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: shp_data,
    scale: TARGET_RESOLUTION,
    maxPixels: 1e13
  }).getNumber('area');
  var forestPct = forestAreaHa.divide(shpAreaHa).multiply(100);
  return ee.Feature(null, {
    'Layer': layer.name,
    'Forest_area_ha': forestAreaHa,
    'Forest_pct_total': forestPct
  });
});

// Convert to FeatureCollection --> turn a list of Features into a proper table
var fc = ee.FeatureCollection(statsList);

// Add ranking (highest % = rank 1)
var ranked = fc.sort('Forest_pct_total', false)
  .map(function(feat) {
    var rank = ee.Number(1)
      .add(fc.filter(ee.Filter.gt('Forest_pct_total', feat.get('Forest_pct_total'))).size());
    return feat.set('Rank', rank);
  });

print('Forest extent per dataset (GEODATA polygons):', ranked);
print('Total GEODATA area (ha):', shpAreaHa);


Export.table.toDrive({
  collection: ranked,
  description: 'ForestExtentSummary_2020',
  folder: EXPORT_FOLDER,
  fileFormat: 'CSV'
});



///////////////////////////////////////////////////////////////
// PART 10: FOREST AGREEMENT ASSESSMENT by PRODUCTION POLYGON 
//////////////////////////////////////////////////////////////

// Computing the EPSG code of production area
var roiCentroid = forestAgreementFiltered.geometry().centroid(ee.ErrorMargin(1));
var longitude = ee.Number(roiCentroid.coordinates().get(0));
var latitude = ee.Number(roiCentroid.coordinates().get(1));

// Function to calculate the UTM zone from longitude
function getUTMZone(lon) {
    return lon.add(180).divide(6).floor().add(1);
}

// Compute the UTM zone
var utmZone = getUTMZone(longitude);
// Determine if it's in the Northern or Southern Hemisphere
var isNorthern = latitude.gt(0);
// Construct the EPSG code for the correct UTM zone
var epsgCode = ee.Algorithms.If(
    isNorthern,
    ee.String('EPSG:326').cat(utmZone.format('%02d')), // Northern Hemisphere (EPSG:326XX)
    ee.String('EPSG:327').cat(utmZone.format('%02d'))  // Southern Hemisphere (EPSG:327XX)
);

print('Computed UTM EPSG Code:', epsgCode);

epsgCode = epsgCode.getInfo();  // Converts from EE object to plain string


// -------- FILTER BY 0.5ha MINIMUM AREA and COMPUTE AREA PERCENTAGE COVER ----------
// Points are NOT considered here since we set a minimum are of 0.5ha, unless user sets a differet minimum area.

// --- 1) area_check flag ---
var addAreaAndCheck = function(feature) {
  var geom = feature.geometry();
  var area_m2 = geom.area({'maxError': 1}); //area in m2
  var area_ha = area_m2.divide(10000);

  // Additionally, compute pixel-count based test (num pixels that would fit at TARGET_RESOLUTION)
  var pixelArea_m2 = ee.Number(TARGET_RESOLUTION).multiply(ee.Number(TARGET_RESOLUTION));
  var minPixels = ee.Number(0.5).multiply(10000).divide(pixelArea_m2); // pixels that equal 0.5 ha

  // number of pixels estimated from polygon area
  var approxPixels = area_m2.divide(pixelArea_m2);

  // If approxPixels < minPixels OR area_ha < 0.5 -> mark below
  var isBelow = approxPixels.lt(minPixels).or(area_ha.lt(0.5));

  return feature.set({
    'area_m2': area_m2,
    'area_ha': area_ha,
    'area_check': ee.Algorithms.If(isBelow, 'below 0.5ha', '')
  });
};

var shp_with_area = shp_data.map(addAreaAndCheck);


// --- 2) Filter polygons that pass the >= 0.5 ha check ---
var passed = shp_with_area.filter(ee.Filter.neq('area_check', 'below 0.5ha'));

// --- 3) Compute pixel-area image and mask for values 6..9 ---
var pixelArea = ee.Image.pixelArea(); // m^2 per pixel

// Create binary mask image (1 where 6..9, else 0) = MAJORITY OF MAPS
var mask6to9 = forestAgreementFiltered.gte(6).and(forestAgreementFiltered.lte(9)).rename('mask6to9').updateMask(ee.Image.constant(1));
var maskAreaImg = mask6to9.multiply(pixelArea).rename('area_6to9_m2');

// --- 4) Reduce: sum of area_6to9_m2 within each polygon ---
var reducer = ee.Reducer.sum();

// Use the TARGET_RESOLUTION and epsgCode for scaling / crs
var stats = maskAreaImg.reduceRegions({
  collection: passed,
  reducer: reducer,
  scale: TARGET_RESOLUTION,
  crs: epsgCode,
  tileScale: 4
});

// Compute percentage relative to polygon area.
var withPercent = stats.map(function(feature) {
  var area6_9_m2 = ee.Number(feature.get('sum')).max(0); // area in m2 for classes 6..9
  var poly_area_m2 = ee.Number(feature.get('area_m2'));

  // If area_m2 is missing for some reason, compute from geometry
  poly_area_m2 = ee.Algorithms.If(poly_area_m2, poly_area_m2, feature.geometry().area(1));
  poly_area_m2 = ee.Number(poly_area_m2);

  // Percentage
  var percent = ee.Number(0);
  percent = ee.Algorithms.If(poly_area_m2.gt(0),
                             area6_9_m2.divide(poly_area_m2).multiply(100),
                             0);
  return feature.set({
    'forestagree': ee.Number(percent).toDouble()
  });
});

// --- 5) Re-attach the original small polygons (so the full collection has area_check for all) ---
// For polygons that were below threshold, keep their area_check and forestaagree as null
var below = shp_with_area.filter(ee.Filter.equals('area_check', 'below 0.5ha'))
                .map(function(f) { return f.set('forestagree', null); });

// Combine both sets
var final = withPercent.merge(below);

print(
  'Check sample features:',
  withPercent.limit(10).select(['area_m2', 'sum', 'forestagree'])
);


// Export the full geometries and attributes as a shapefile.
Export.table.toDrive({
  collection: final,
  description: 'Geodata_ForestAgreement_2020',
  folder: EXPORT_FOLDER,  
  fileFormat: EXPORT_FORMAT
});


// ------------------------------- END OF SCRIPT -----------------------------------------------------------------


