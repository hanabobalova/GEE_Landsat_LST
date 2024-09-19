/*
Author: Sofia Ermida (sofia.ermida@ipma.pt; @ermida_sofia)

This code is free and open. 
By using this code and any data derived with it, 
you agree to cite the following reference 
in any publications derived from them:
Ermida, S.L., Soares, P., Mantas, V., Göttsche, F.-M., Trigo, I.F., 2020. 
    Google Earth Engine open-source code for Land Surface Temperature estimation from the Landsat series.
    Remote Sensing, 12 (9), 1471; https://doi.org/10.3390/rs12091471

Modified by: Hana Bobáľová (hana.bobalova@uniba.sk)
Modified description of 'use_ndvi' variable.
Changed input settings.

Example 1:
  This example shows how to compute Landsat LST with NDVI-based emissivity from Landsat-8 over Bratislava, Slovakia
  This corresponds to the example images shown in Bobalova et al. (in press)
    
*/

///////////////////////////// ATTENTION //////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////
//
// As off 11.07.2022 a new version of the code is released:
//      - update to use collection 2 data
//      - emissivities of water and snow surfaces are now prescribed 
// 
// the previous version of the code will still be available; the replaced code
// is commented
//
//////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////


// link to the code that computes the Landsat LST
var LandsatLST = require('users/hanele/LST:SMW/Landsat_LST_SMW_NBEM.js')



// select region of interest, date range (or ranges), and landsat satellite
// use_ndvi:  set 0 for ASTER emissivity, 1 for ASTER emissivity with NDVI corrections, or 2 for NDVI-based emissivity

var geometry = ee.Geometry.Rectangle([16.91, 48.28, 17.29, 47.98]);
var satellite = 'L8';
var date_start = '2022-07-22';
var date_end = '2022-07-23';
var use_ndvi = 2; 


// get landsat collection with added variables: NDVI, FVC, TPW, EM, LST
var LandsatColl = LandsatLST.collection(satellite, date_start, date_end, geometry, use_ndvi)

print(LandsatColl)


// select the first feature
var exImage = LandsatColl.first();

var cmap1 = ['blue', 'cyan', 'green', 'yellow', 'red'];
var cmap2 = ['F2F2F2','EFC2B3','ECB176','E9BD3A','E6E600','63C600','00A600']; 

Map.centerObject(geometry)
Map.addLayer(exImage.select('TPW'),{min:0.0, max:60.0, palette:cmap1},'TCWV')
Map.addLayer(exImage.select('TPWpos'),{min:0.0, max:9.0, palette:cmap1},'TCWVpos')
Map.addLayer(exImage.select('FVC'),{min:0.0, max:1.0, palette:cmap2}, 'FVC')
Map.addLayer(exImage.select('EM'),{min:0.9, max:1.0, palette:cmap1}, 'Emissivity')
Map.addLayer(exImage.select('B10'),{min:290, max:320, palette:cmap1}, 'TIR BT')
Map.addLayer(exImage.select('LST'),{min:290, max:320, palette:cmap1}, 'LST')
Map.addLayer(exImage.multiply(0.0000275).add(-0.2),{bands: ['SR_B4', 'SR_B3', 'SR_B2'], min:0, max:0.3}, 'RGB')


// uncomment the code below to export a image band to your drive
/*
var crst = [30,0,-15,0,-30,15] // Landsat image shift


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
*/
