////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
 /*
 FOREST AGREEMENT LAYER - ROI                                                                                                            //
 Version: 1.0 (12.12.2025)                                                                                                              //    
 Data Input: Drawing region of interest (ROI), Geometry                                                                                //  
 Repository: https://github.com/GEOS-EUDR/gee_forest_agreement_layer                                                                  //
 Summary: Generates a forest agreement layer over user-defined ROIs in GEE.                                                          //
 ROIs can be drawn in the Code Editor, taken from built-in boundaries,                                                              //
 imported from Drive/Assets, created programmatically, or derived from                                                             //
 image/collection bounds. The scritp covers data preparation, reclassification, agreement calculation,                            //
 cluster-based exports, and forest extent summaries.                                                                             //
 Includes a user section for setting parameters and an automated section that handles all processing steps.                     //
 Copyright © 2025 Thünen-Institute, Juliana Freitas Beyer, Margret Köthke, Melvin Lippe                                        //
---------------------------------------------------------------                                                               //
 New to Google Earth Engine (GEE) API scripting?                                                                             //    
 Please check introduction tutorials: https://developers.google.com/earth-engine/tutorials/tutorial_api_01                  //
 */
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


///////////////////////////////////////
// PART 0: USER-DEFINED CONSTANTS --> Modify the settings below as desired
///////////////////////////////////////

var TARGET_RESOLUTION = 30;       // meters (final/full-res)
var VIS_RESOLUTION = 120;         // meters (visualization; increase to reduce memory)
var SIEVE_THRESHOLD_PIXELS = 6;   // pixels for filtering out (6 pixels ~0.5 ha at 30m), minimum mapping unit
var FOREST_HEIGHT_MIN = 5;        // meters
var AGREEMENT_RADIUS = 1;         // pixels for focalMode filter. When value is "1", the filter looks at a 3×3 neighborhood (1 pixel in every direction → center + 8 surrounding pixels)
var VIS_BUFFER = 30000;           // meters of buffer for visualization window around ROI centroid


///////////////////////////////////////
// PART 0A: INPUT SETTINGS (LOAD DATA) --> Use this ONLY when the region is not drawn directly in the Code Editor.
///////////////////////////////////////
// More info: https://developers.google.com/earth-engine/guides/manage_assets

// METHOD 1. Using built-in administrative or thematic boundaries
// Earth Engine hosts several collections of boundaries such as GAUL, GADM, LSIB, and others.
// Example: Ghana national boundary (GADM)
// https://developers.google.com/earth-engine/datasets/catalog/FAO_GAUL_2015_level0
/*
var roi = ee.FeatureCollection('FAO/GAUL/2015/level0')
              .filter(ee.Filter.eq('ADM0_NAME', 'Ghana'))
              .geometry();
*/



// METHOD 2. Importing a geometry from Google Drive / Earth Engine Assets
// User uploads a shapefile, KML, or GeoJSON to their Assets.
// Example: ROI loaded from an EE asset
/*
var roi = ee.FeatureCollection('projects/ee-username/assets/MyROI').geometry();
*/


// METHOD 3. Creating a geometry programmatically
//Useful when the ROI is simple or parameter-driven.

// Polygon defined by coordinates
/*
var roi = ee.Geometry.Polygon([
  [[-10.1, 6.3], [-10.1, 6.0], [-9.8, 6.0], [-9.8, 6.3]]
]);

// Center point + buffer
/*
var roi = ee.Geometry.Point([ -73.5, -3.1 ]).buffer(5000); // meters
*/


// METHOD 4. Using the bounds of an image or image collection
// This lets the data “draw its own frame,” like a map unrolling around the data.
/*
var ls = ee.Image('LANDSAT/LC08/C02/T1_L2/LC08_044034_20200716');
var roi = ls.geometry();
*/


///////////////////////////////////////
// PART 0B: OUTPUT SETTINGS (EXPORT)
///////////////////////////////////////
// More info: https://developers.google.com/earth-engine/guides/exporting

// 1. Choose where the forest-agreement layer will be exported.
//    'Drive' → saves the file to your Google Drive
//    'Asset' → saves the file to your Earth Engine Assets (shown in the left panel)
var EXPORT_TARGET = 'Drive';   // Options: 'Drive' or 'Asset'


// 2. Settings used ONLY when EXPORT_TARGET = 'Asset'
//    Provide the EE asset ID where the export should be saved.
var EXPORT_ASSET_ID = 'users/your_username/ForestAgreement_2020';
// <-- Replace with your EE username and desired asset name

// 3. Settings used ONLY when EXPORT_TARGET = 'Drive'
//    These fields define the Drive folder and file description.
var EXPORT_FOLDER = 'ForestAgreementExports';
var EXPORT_DESCRIPTION = 'ForestAgreement_2020';



///////////////////////////////////////
// PART 0C: TILING SIZE 
///////////////////////////////////////
/*
Set the number of tiles used for export the forest agreement layer
- The size of tile is based on the size of "roi"
- The larger your ROI, the more tiles may be required. More tiles increase processing time. A balance should be defined here.
- Increasing the values below creates more (and therefore smaller) tiles.
- Recommendation: Use "1" for rows and columns for small ROIs; use "2" or "3" for larger ROIs.
*/

var numRows = 2;  // fewer rows → larger tiles
var numCols = 2;  // fewer columns → larger tiles










////// ----------- From this point onward, the script runs AUTOMATICALLY ------------ //////

///////////////////////////////////////
// PART 1: DEFINED REGION OF INTEREST
///////////////////////////////////////

// Define or draw roi in EE.
if (typeof roi === 'undefined') {
  throw 'Please define a geometry variable named "roi" (either by drawing using the geometry tools or editing the script).';
}


Map.addLayer(ee.FeatureCollection([ee.Feature(roi)]).style({
  color:'black', fillColor:'00000000', width:2
}), {}, 'ROI');
Map.centerObject(roi);

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
var forestAgreementFiltered = forestAgreement.where(smallPatches, majorityClass);


///////////////////////////////////////
// PART 7: LIGHTWEIGHT VISUALIZATION
///////////////////////////////////////

// Smaller visualization area + downscaled layer
var visROI = roi.centroid(ee.ErrorMargin(1)).buffer(VIS_BUFFER);

// Function to standardize reproject + clip for any agreement layer
function prepareVisLayer(image) {
  return image
    .reproject({crs: 'EPSG:4326', scale: VIS_RESOLUTION})
    .clip(visROI);
}

var forestAgreementVis = prepareVisLayer(forestAgreementFiltered);
var forestAgreementVis_raw  = prepareVisLayer(forestAgreement);

// Palette for 0–9 agreement values
var palette = ['#D3D3D3', '#FF0000', '#F08080', '#FFA500', '#FFD580',
               '#FFFF00', '#CCCC00', '#90EE90', '#32CD32', '#006400'];
var labels = ['0 maps', '1 map', '2 maps', '3 maps', '4 maps',
              '5 maps', '6 maps', '7 maps', '8 maps', '9 maps'];

// Add Layers
var visParams = {min: 0, max: 9, palette: palette};
Map.addLayer(forestAgreementVis, visParams, 'Forest Agreement Buffer (Filtered)');
Map.addLayer(forestAgreementVis_raw, visParams, 'Forest Agreement Buffer (Raw)');
Map.centerObject(visROI);

// Legend UI
var legend = ui.Panel({style: {position: 'bottom-left', padding: '8px 15px'}});
legend.add(ui.Label({value: 'Legend: Forest Agreement', style: {fontWeight: 'bold', fontSize: '16px'}}));
var makeRow = function(color, name) {
  return ui.Panel({
    widgets: [
      ui.Label({style: {backgroundColor: color, padding: '8px', margin: '0 0 4px 0'}}),
      ui.Label({value: name, style: {margin: '0 0 4px 6px'}})
    ],
    layout: ui.Panel.Layout.Flow('horizontal')
  });
};
for (var i = 0; i < palette.length; i++) legend.add(makeRow(palette[i], labels[i]));
Map.add(legend);


///////////////////////////////////////
// PART 8: ROI-BASED TILED EXPORT
///////////////////////////////////////

// Compute best UTM EPSG for geometry - Function
function getUTMEPSG(geometry) {
  var centroid = geometry.centroid(ee.ErrorMargin(1));
  var lon = ee.Number(centroid.coordinates().get(0));
  var lat = ee.Number(centroid.coordinates().get(1));
  var utmZone = lon.add(180).divide(6).floor().add(1);
  var epsg = ee.Algorithms.If(
    lat.gt(0),
    ee.String('EPSG:326').cat(utmZone.format('%02d')),  // Northern hemisphere
    ee.String('EPSG:327').cat(utmZone.format('%02d'))   // Southern hemisphere
  );

  return ee.String(epsg);
}

// Get ROI bounds
var extent = roi.bounds();
var coords = extent.coordinates().get(0);
var lons = ee.List(coords).map(function(c){ return ee.List(c).get(0); });
var lats = ee.List(coords).map(function(c){ return ee.List(c).get(1); });
var minLon = ee.Number(lons.reduce(ee.Reducer.min()));
var maxLon = ee.Number(lons.reduce(ee.Reducer.max()));
var minLat = ee.Number(lats.reduce(ee.Reducer.min()));
var maxLat = ee.Number(lats.reduce(ee.Reducer.max()));

// Define tile size
var gridSizeLon = maxLon.subtract(minLon).divide(numCols);
var gridSizeLat = maxLat.subtract(minLat).divide(numRows);

// Clip image once to the ROI (before tiling)
var forestAgreementExport = forestAgreementFiltered
                             .clip(roi)
                             .toByte();  

// Build a list of tile geometries (server‑side)
var cols = ee.List.sequence(0, numCols - 1);
var rows = ee.List.sequence(0, numRows - 1);

var tileFeatures = cols.map(function(col){
  return rows.map(function(row){
    var lon0 = minLon.add(ee.Number(col).multiply(gridSizeLon));
    var lat0 = minLat.add(ee.Number(row).multiply(gridSizeLat));
    var tileGeom = ee.Geometry.Rectangle([lon0, lat0,
                                          lon0.add(gridSizeLon),
                                          lat0.add(gridSizeLat)]);
    return ee.Feature(tileGeom, {col: col, row: row});
  });
}).flatten();

var tileFC = ee.FeatureCollection(tileFeatures)
              .filterBounds(roi);  


// Export Loop
tileFC.toList(tileFC.size()).evaluate(function(tileList) {
  tileList.forEach(function(t, i) {
    var feature = ee.Feature(t);
    var geom = feature.geometry();
    var tileName = EXPORT_DESCRIPTION + '_tile_' + i;
    var descDrive = tileName + '_Drive';
    var descAsset = tileName + '_Asset';
    var assetId = EXPORT_ASSET_ID + '_tile_' + i;
    getUTMEPSG(geom).evaluate(function(crsStr) {
      print('📡 Exporting tile', i, 'with CRS', crsStr);
      if (EXPORT_TARGET === 'Drive') {
        Export.image.toDrive({
          image: forestAgreementExport.clip(geom),
          description: descDrive,
          folder: EXPORT_FOLDER,
          fileNamePrefix: descDrive,
          region: geom,
          scale: TARGET_RESOLUTION,
          crs: crsStr,
          fileFormat: 'GeoTIFF',
          maxPixels: 1e13
        });
      } else if (EXPORT_TARGET === 'Asset') {

        Export.image.toAsset({
          image: forestAgreementExport.clip(geom),
          description: descAsset,
          assetId: assetId,
          region: geom,
          scale: TARGET_RESOLUTION,
          crs: crsStr,
          maxPixels: 1e13
        });
      } else {
        print("⚠️ Unknown EXPORT_TARGET setting. Choose 'Drive' or 'Asset'.");
      }

    });

  });

});



/////////////////////////////////////////////////////////
// PART 9: FOREST EXTENT SUMMARY (per dataset, ROI-wide)
////////////////////////////////////////////////////////
// This section ranks the 9 layers by forest extent (area) within the ROI, from largest to smallest


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
var roiAreaHa = ee.Image.pixelArea().divide(10000)
  .reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: roi,
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
    geometry: roi,
    scale: TARGET_RESOLUTION,
    maxPixels: 1e13
  }).getNumber('area');
  var forestPct = forestAreaHa.divide(roiAreaHa).multiply(100);
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

print('Forest extent per dataset:', ranked);
print('ROI area (ha):', roiAreaHa);


Export.table.toDrive({
  collection: ranked,
  description: 'ForestExtentSummary_2020',
  folder: EXPORT_FOLDER,
  fileFormat: 'CSV'
});


// ------------------------------- END OF SCRIPT -----------------------------------------------------------------
