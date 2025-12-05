///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// FOREST AGREEMENT LAYER - GEODATA                                                                                                     //
// Version: 1.0 (05.01.2025)                                                                                                           //    
// Data Input: Geodata of Production Polygons or Points                                                                               //  
// Repository: https://github.com/yourname/yourrepo                                                                                  //
// Summary of Script: Generates a forest agreement layer over user-defined polygons or points.                                      //
// Walks through data prep, reclassification, agreement calculation, cluster-based exports,                                        //
// and forest extent summaries. The script includes a user section for setting parameters                                         //
// and an automated section that handles all processing steps.                                                                   //
//---------------------------------------------------------------                                                               //
// New to Google Earth Engine (GEE) API scripting?                                                                             //    
// Please check introduction tutorials: https://developers.google.com/earth-engine/tutorials/tutorial_api_01                  //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


/////////////////////////////////////////
// PART 0: USER-DEFINED CONSTANTS
////////////////////////////////////////

var TARGET_RESOLUTION = 30;       // meters (final/full-res)
var SIEVE_THRESHOLD_PIXELS = 6;   // pixels for filtering out (6 pixels ~0.5 ha at 30m), minimum mapping unit
var FOREST_HEIGHT_MIN = 5;        // meters
var AGREEMENT_RADIUS = 1;         // pixels for focalMode filter. When value is "1", the filter looks at a 3×3 neighborhood (1 pixel in every direction → center + 8 surrounding pixels)


///////////////////////////////////////
// PART 0A: EXPORT SETTINGS
///////////////////////////////////////
// More information on exporting with GEE --> https://developers.google.com/earth-engine/guides/exporting

var EXPORT_FOLDER = 'ForestAgreementExports';
var EXPORT_DESCRIPTION = 'ForestAgreement_2020';

// --> CHOOSES HOW YOU WISH TO EXPORT THE FOREST AGREEMENT LAYER SECTIONS
// Set to 'Drive' to export to Google Drive
// Set to 'Asset' to export to Earth Engine Asset
var EXPORT_TARGET = 'Drive'; 

// If "Asset" is chosen, also insert path:
var EXPORT_ASSET_ID = 'users/your_username/ForestAgreement_2020'; //<-- Change here to your username

// Select a format of exported file
var EXPORT_FORMAT = 'SHP' // Other options: 'KML'; 'KMZ', 'GeoJSON'


///////////////////////////////////////
// PART 0B: LOAD/DEFINE SHAPEFILE
///////////////////////////////////////
// Upload your desired production polygons in Assets 
// Suitable formats are: shapefiles(.shp), KML/KMZ, .json or csv with geometry

// Step 1: Choose whether input geodata is Polygon or Point
  // 'Polygon' = traditional production polygons
  // 'Point'   = input points that are automatically buffered into polygons
var GEODATA_TYPE = 'Point';       // Options: 'Polygon' or 'Point'

// Step 2: Buffer radius used ONLY when GEODATA_TYPE = 'Point'
var POINT_BUFFER_METERS = 110;     // <-- User choice, size is in meters
  // Note: A larger buffer stretches each point into a wider “influence zone,” capturing more surrounding forest but reducing spatial precision; a smaller buffer does the opposite by keeping the analysis tightly focused around each point.
  // Recommended size: 110 m to 112 m considering TARGET_RESOLUTION = 30

// Step 3: Path to geodata stored in Assets
var SHAPEFILE_PATH = 'projects/ee-yourusername/assets/your_geodata_here'; //<-- Insert here your username, and geodata name








////// ----------- From this point onward, the script runs AUTOMATICALLY ------------ //////

///////////////////////////////////////
// PART 1: DEFINED REGION OF INTEREST
///////////////////////////////////////

if (SHAPEFILE_PATH.indexOf('your_shapefile_here') !== -1) {
  throw new Error(
    'ERROR: Please specify your shapefile from uploaded to "Assets" by setting the variable SHAPEFILE_PATH before running the script.'
  );
}


// DEFINE CLUSTER-BASED ROI AROUND POLYGONS (SHAPEFILE)

var shp_data = ee.FeatureCollection(SHAPEFILE_PATH);
print('Shapefile feature count:', shp_data.size());

// Case 1: if GEODATA_TYPE = "Polygon"
var geomForClustering = ee.FeatureCollection(
  ee.Algorithms.If(
    GEODATA_TYPE === 'Polygon',
    shp_data,                                   // polygons as-is
    shp_data.map(function(ft) {                 // points are buffered
      return ft.buffer(POINT_BUFFER_METERS);
    })
  )
);

// ---------------------------------------------------------------------

// Case 2: if GEODATA_TYPE = 'Point')
var unioned = geomForClustering
  .map(function(f) { 
    return f.buffer(10000); // small buffer to join nearby features
  })
  .union()
  .geometry();
// Extract individual cluster geometries
var clusterGeoms = ee.List(unioned.geometries());
// Convert cluster geometries → bounding boxes
var clusterBoundsFC = ee.FeatureCollection(
  clusterGeoms.map(function(g) {
    var geom = ee.Geometry(g);
    return ee.Feature(geom.bounds());
  })
);

print('Cluster bounding boxes:', clusterBoundsFC);



// All clusters combined as ROI for loading datasets
var roi = clusterBoundsFC.geometry();


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


// Compute and Extract median forest agreement within each polygon 
var stats = forestAgreementFiltered.reduceRegions({
  collection: shp_data,
  reducer: ee.Reducer.median(),
  crs: epsgCode,
  scale: 30
}).map(function(feature) {
  var median = feature.get('median');
  return feature.set('forestagree', median)
                .copyProperties(feature)
                .set('median', null);  
});


// Get only the "Median_forestagree" property and remove duplicates
var medianValues = stats.aggregate_array('forestagree').distinct();
medianValues.evaluate(function(values) {
  print('Unique values of forestagree:', values);
});


// Export the full geometries and attributes as a shapefile.
Export.table.toDrive({
  collection: stats,
  description: 'Polygons_ForestAgreement_2020',
  folder: EXPORT_FOLDER,  
  fileFormat: EXPORT_FORMAT
});


// ------------------------------- END OF SCRIPT -----------------------------------------------------------------


