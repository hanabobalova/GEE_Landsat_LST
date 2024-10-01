/*
Author: Hana Bobalova (hana.bobalova@uniba.sk)

This code is free and open. 
By using this code and any data derived with it, 
you agree to cite the following reference 
in any publications derived from them:
article in press

USES:
    LST_RTE_functions.js
INPUTS:
    dateRanges: <list>
        list of lists of start date and end date string pairs to filter Landsat collection
        format: [['YYYY-MM-DD','YYYY-MM-DD'],...]
    geometry: <ee.Geometry>
        region of interest     

OUTPUTS:
    <ee.ImageCollection>
        image collection with bands:
          landsat original bands: visible R,G,B,NIR,TIR,ATRAN,URAD,DRAD,QA from SR collection, TIR from DN collection 
          'NDVI': normalized vegetation index
          'FVC': fraction of vegetation cover [0-1]
          'LSE': land surface emissivity for TIR band [0-1]
          'LTOA': Top-of-Atmosphere radiance [W/m2·sr·μm]
          'BTS': blackbody (ground) radiance [W/m2·sr·μm]
          'LST': land surface temperature [K]
          'LSTC': land surface temperature [degrees Celsius]
          'ST': USGS Landsat surface temperature [K]
*/

var func = require('users/hanele/LST:RTE/LST_RTE_functions.js');



// users input parameters
var dateRanges = [['2022-07-22','2022-07-23']]
var geometry = ee.Geometry.Rectangle([16.91, 48.28, 17.29, 47.98]);  

// Landsat collections and bands
// uncomment the code below according to the Landsat satellite used
/*
// Landsat 9
var coll_SR = 'LANDSAT/LC09/C02/T1_L2'
var coll_DN = 'LANDSAT/LC09/C02/T1'
var SR_bands = ['SR_B2','SR_B3','SR_B4','SR_B5','ST_B10','ST_ATRAN','ST_URAD','ST_DRAD','QA_PIXEL'];
var TIR_band = ['B10']
var K1_string = 'K1_CONSTANT_BAND_10'
var K2_string = 'K2_CONSTANT_BAND_10'
*/
// Landsat 8
var coll_SR = 'LANDSAT/LC08/C02/T1_L2'
var coll_DN = 'LANDSAT/LC08/C02/T1'
var SR_bands = ['SR_B2','SR_B3','SR_B4','SR_B5','ST_B10','ST_ATRAN','ST_URAD','ST_DRAD','QA_PIXEL'];
var TIR_band = ['B10']
var K1_string = 'K1_CONSTANT_BAND_10'
var K2_string = 'K2_CONSTANT_BAND_10'

/*
// Landsat 7
var coll_SR = 'LANDSAT/LE07/C02/T1_L2'
var coll_DN = 'LANDSAT/LE07/C02/T1'
var SR_bands = ['SR_B1','SR_B2','SR_B3','SR_B4','ST_B6','ST_ATRAN','ST_URAD','ST_DRAD','QA_PIXEL'];
var TIR_band = ['B6_VCID_1']
var K1_string = 'K1_CONSTANT_BAND_6_VCID_1'
var K2_string = 'K2_CONSTANT_BAND_6_VCID_2'
var K2_string = 'K2_CONSTANT_BAND_6'


// Landsat 5
var coll_SR = 'LANDSAT/LT05/C02/T1_L2'
var coll_DN = 'LANDSAT/LT05/C02/T1'
var SR_bands = ['SR_B1','SR_B2','SR_B3','SR_B4','ST_B6','ST_ATRAN','ST_URAD','ST_DRAD','QA_PIXEL'];
var TIR_band = ['B6']
var K1_string = 'K1_CONSTANT_BAND_6'
var K2_string = 'K2_CONSTANT_BAND_6'

// Landsat 4
var coll_SR = 'LANDSAT/LT04/C02/T1_L2'
var coll_DN = 'LANDSAT/LT04/C02/T1'
var SR_bands = ['SR_B1','SR_B2','SR_B3','SR_B4','ST_B6','ST_ATRAN','ST_URAD','ST_DRAD','QA_PIXEL'];
var TIR_band = ['B6']
var K1_string = 'K1_CONSTANT_BAND_6'
var K2_string = 'K2_CONSTANT_BAND_6'
*/

// filter SR collections by date
var filterSRByDateRange = function(dateRange) {
    var startDate = ee.Date(dateRange[0]);
    var endDate = ee.Date(dateRange[1]);
    return ee.ImageCollection(coll_SR)
      .filterDate(startDate, endDate)
      .filter(ee.Filter.eq('PROCESSING_LEVEL','L2SP'))
      .filterBounds(geometry)
      .select(SR_bands)
      .first();
  };

  
// calculate LSE from SR collection
var landsatSR = ee.ImageCollection(dateRanges.map(filterSRByDateRange)
  .map(func.calcNDVI)
  .map(func.calcFVC)
  .map(func.calcLSE))
print('LandsatSR',landsatSR)

// filter the images from DN collection according to SR collection
var filterDNBySceneIDs = function(image) {
  var sceneID = image.get('system:index');
  return ee.ImageCollection(coll_DN).filterMetadata('system:index', 'equals', sceneID).select(TIR_band).first();
};

var filteredDN = landsatSR.map(filterDNBySceneIDs);

// calculate LTOA
var landsatTOA = filteredDN
  .map(func.calcLTOA)
print('LandsatTOA',landsatTOA)

// get K1 and K2 thermal constants from metadata
var K1 = landsatTOA.first().get(K1_string)
var K2 = landsatTOA.first().get(K2_string)
print(K1,K2)

// wrapper function for LST calculation
function wrap(image) {
  return func.calcLST(image,K1,K2);
}


// combine SR and TOA collections and calculate LST
var landsatLST = landsatSR.combine(landsatTOA)
  .map(func.calcBTS)
  .map(wrap)
  .map(func.calcLSTC)
  .map(func.calcST)

print('landsatLST',landsatLST);


// create cloud mask from QA layer
var maskClouds = function(image){
  var qa = image.select('QA_PIXEL');
  var mask = qa.bitwiseAnd(1 << 3)
    .or(qa.bitwiseAnd(1 << 4));
  return image.updateMask(mask.not());
};
//var collLSTCm = collLSTC.map(maskClouds)

// select the first image from collection
var img1 = landsatLST.first();


// select other images from the list (indexing starts from 0)
var exList = landsatLST.toList(landsatLST.size());
var img2 = ee.Image(exList.get(1))


// Display the results
var img = img1
var cmap1 = ['blue', 'cyan', 'green', 'yellow', 'red'];
Map.centerObject(img, 9);
Map.addLayer(img.multiply(0.0000275).add(-0.2),{bands: ['SR_B4', 'SR_B3', 'SR_B2'], min:0, max:0.3}, 'RGB')
Map.addLayer(img.select('NDVI'),{min:0.0, max:1.0, palette:cmap1}, 'NDVI')
Map.addLayer(img.select('FVC'),{min:0.0, max:1.0}, 'FVC')
Map.addLayer(img.select('LSE'),{min:0.9, max:1.0}, 'Emissivity')
Map.addLayer(img.select('LST'),{min:290, max:320, palette:cmap1}, 'LST')
Map.addLayer(img.select('ST'),{min:290, max:320, palette:cmap1}, 'ST')



// save image to drive
var crst = [30,0,-15,0,-30,15] // image shift


Export.image.toDrive({
  image: img.select('LST'),
  description: 'LST',
  crs: 'EPSG:32633',
  crsTransform: crst,
  scale: 30,
  region: geometry,
  fileFormat: 'GeoTIFF',
  folder: 'LST'
});


