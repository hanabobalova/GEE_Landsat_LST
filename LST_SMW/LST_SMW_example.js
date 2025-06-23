/*
This code is heavily based on the work of Sofia Ermida (sofia.ermida@ipma.pt; @ermida_sofia)
This code is free and open.
By using this code and any data derived with it, 
you agree to cite the following reference 
in any publications derived from them:
Ermida, S.L., Soares, P., Mantas, V., Göttsche, F.-M., Trigo, I.F., 2020. 
    Google Earth Engine open-source code for Land Surface Temperature estimation from the Landsat series.
    Remote Sensing, 12 (9), 1471; https://doi.org/10.3390/rs12091471

    
Author: Hana Bobáľová (hana.bobalova@uniba.sk), Šimon Opravil (simon.opravil@savba.sk)

This file demonstrates how to use the `SMW_Wrapper.js` to calculate Land Surface Temperature (LST) 
for a given region of interest (ROI) and time range. It uses the Single-Channel Method (SMW) 
and integrates the NDVI-based emissivity calculation from `LSE_NBEM.js`.

USES:
    - LST_SMW_Wrapper.js
    - LSE_NBEM.js

INPUTS:
    - coll: <string>
        Landsat satellite ID. Valid inputs: 'L4', 'L5', 'L7', 'L8', 'L9'.
    - aoi: <ee.Geometry>
        Region of interest (ROI) as a geometry object.
    - start: <string> or <list>
        Start date(s) for filtering the image collection. Can be a single date string 
        or a list of date strings.
    - end: <string> (optional)
        End date for filtering the image collection. If specified, `start` must be a 
        single date string. Can be None.
    - lseMethod: <number>
        Determines how emissivity is calculated:
        0: Emissivity is obtained directly from ASTER.
        1: NDVI values are used to obtain dynamic emissivity from ASTER.
        2: Emissivity is calculated using the NDVI-based method (NBEM).
    - nbem: <string>
        Equations used to calculate the NDVI-based emissivity. 
        Valid inputs: 'Skoković', 'Sobrino', 'Yu', 'SNDVI'. For References, please see the LSE_NBEM.js file.
    - emissVals: <string>
        Emissivity values of soil and vegetation used in the SNDVI method. 
        Valid inputs: 'Skoković', 'Wang', 'Yu'. For References, please see the LSE_NBEM.js file.

OUTPUTS:
    - <ee.ImageCollection>
        An image collection with the following bands:
        - Original Landsat bands: SR_B2, SR_B3, SR_B4, SR_B5, etc.
        - NDVI: Normalized Difference Vegetation Index
        - FVC: Fractional Vegetation Cover
        - TPW: Total Precipitable Water
        - TPWpos: Positive TPW values
        - EM: Surface emissivity of the TIR band
        - LST: Land Surface Temperature (Kelvin)
*/

var LandsatLST = require('users/simonopravil/LTS_Bobalova:LST_SMW/LST_SMW_wrapper.js');

// Define the region of interest (ROI) as a rectangle
var roi = ee.Geometry.Rectangle([16.91, 48.28, 17.29, 47.98]);

// Define the parameters for LST calculation
var params = {
  coll: 'L8', // Landsat 8
  aoi: roi, // Region of interest
  start: ['2013-07-29', '2022-07-22'], // Start dates for filtering
  lseMethod: 2 // Use NDVI-based emissivity
};

// Calculate the Landsat LST collection
var LandsatColl = LandsatLST.collection(params).aside(print);

// Select the first image from the collection
var exImage = LandsatColl.first();

// Define color maps for visualization
var cmap1 = ['blue', 'cyan', 'green', 'yellow', 'red'];
var cmap2 = ['F2F2F2', 'EFC2B3', 'ECB176', 'E9BD3A', 'E6E600', '63C600', '00A600'];

// Center the map on the ROI and add layers for visualization
Map.centerObject(roi);
Map.addLayer(exImage.select('TPW'), {min: 0.0, max: 60.0, palette: cmap1}, 'TCWV');
Map.addLayer(exImage.select('TPWpos'), {min: 0.0, max: 9.0, palette: cmap1}, 'TCWVpos');
Map.addLayer(exImage.select('FVC'), {min: 0.0, max: 1.0, palette: cmap2}, 'FVC');
Map.addLayer(exImage.select('NDVI'), {min: 0.0, max: 1.0, palette: cmap1}, 'NDVI');
Map.addLayer(exImage.select('EM'), {min: 0.9, max: 1.0, palette: cmap1}, 'Emissivity');
Map.addLayer(exImage.select('B10'), {min: 290, max: 320, palette: cmap1}, 'TIR BT');
Map.addLayer(exImage.select('LST'), {min: 290, max: 320, palette: cmap1}, 'LST');
Map.addLayer(exImage.multiply(0.0000275).add(-0.2), {bands: ['SR_B4', 'SR_B3', 'SR_B2'], min: 0, max: 0.3}, 'RGB');

// Save the LST image to Google Drive
var crst = [30, 0, -15, 0, -30, 15]; // Image shift

Export.image.toDrive({
  image: exImage.select('LST'),
  description: 'LST',
  crs: 'EPSG:32633',
  crsTransform: crst,
  scale: 30,
  region: roi,
  fileFormat: 'GeoTIFF',
});
