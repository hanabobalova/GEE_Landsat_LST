/*
Author: Hana Bobalova (hana.bobalova@uniba.sk), Simon Opravil (simon.opravil@savba.sk)

This code is free and open. 

This file demonstrates how to use the `LST_RTE` function from the wrapper to calculate 
Land Surface Temperature (LST) for a given region of interest (ROI) and time range.


USES:
    - LST_RTE_functions.js
    - LST_RTE_wrapper.js

INPUTS:
    - coll: <string> (required)
        Landsat satellite ID. Valid inputs: 'L4', 'L5', 'L7', 'L8', 'L9'.
    - aoi: <ee.Geometry> (required)
        Region of interest (ROI) as a geometry object.
    - start: <string> or <list> (required)
        Start date(s) for filtering the image collection. Can be a single date string 
        or a list of date strings.
    - end: <string> (optional)
        End date for filtering the image collection. If specified, `start` must be a 
        single date string.
    - nbem: <string> (optional, default: 'Skokovic')
        Equations for calculating land surface emissivity by the NDVI-based method (NBEM). 
        Valid inputs: 'Skokovic', 'Sobrino', 'Yu', 'SNDVI'. For References, please see the RTE_functions.js file.
    - emissVals: <string> (optional, default: 'Skokovic')
        Emissivity values of soil and vegetation used in the SNDVI method. 
        Valid inputs: 'Skokovic', 'Wang', 'Yu'. For References, please see the RTE_functions.js file.
    - ImageToDisplay: <number> (optional, default: 0)
        Index of the image to display from the processed collection.

OUTPUTS:
    - <ee.ImageCollection> with the following bands:
        - Original Landsat bands: SR_B2, SR_B3, SR_B4, SR_B5, ST_B10, etc.
        - NDVI: Normalized Difference Vegetation Index
        - FVC: Fractional Vegetation Cover
        - LSE: Land Surface Emissivity
        - LTOA: Top of Atmosphere Radiance
        - BTS: Blackbody Radiance
        - LST: Land Surface Temperature (Kelvin)
        - LSTC: Land Surface Temperature (Celsius)
        - ST: Surface Temperature from USGS Landsat ST product (Kelvin)
*/

// Import the wrapper module
var wp = require('users/simonopravil/LTS_Bobalova:LST_RTE/LST_RTE_wrapper');

// Define the region of interest (ROI) as a rectangle
var roi = ee.Geometry.Rectangle([16.91, 48.28, 17.29, 47.98]);

// Define the parameters for LST calculation
var params = {
  coll: 'L8', // Landsat 8
  aoi: roi, // Region of interest
  start: ['2022-07-22', '2013-07-29'], // Start dates for filtering
  nbem: 'Skokovic', // NDVI-based emissivity method (NBEM)
  ImageToDisplay: 0 // Index of the image to display
};

// Calculate LST using the wrapper function
var rte = wp.LST_RTE(params);

// Convert the image collection to a list and select the image to display
var imgList = rte.toList(rte.size());
var img = ee.Image(imgList.get(params.ImageToDisplay));

// Define a color map for visualization
var cmap1 = ['blue', 'cyan', 'green', 'yellow', 'red'];

// Center the map on the selected image and add layers for visualization
Map.centerObject(img, 9);
Map.addLayer(img.multiply(0.0000275).add(-0.2), {bands: ['SR_B4', 'SR_B3', 'SR_B2'], min: 0, max: 0.3}, 'RGB');
Map.addLayer(img.select('NDVI'), {min: 0.0, max: 1.0, palette: cmap1}, 'NDVI');
Map.addLayer(img.select('FVC'), {min: 0.0, max: 1.0}, 'FVC');
Map.addLayer(img.select('LSE'), {min: 0.9, max: 1.0}, 'Emissivity');
Map.addLayer(img.select('LST'), {min: 290, max: 320, palette: cmap1}, 'LST');
Map.addLayer(img.select('ST'), {min: 290, max: 320, palette: cmap1}, 'ST');

// Save the LST image to Google Drive
var crst = [30, 0, -15, 0, -30, 15]; // Image shift

Export.image.toDrive({
  image: img.select('LST'),
  description: 'LST',
  crs: 'EPSG:32633',
  crsTransform: crst,
  scale: 30,
  region: roi,
  fileFormat: 'GeoTIFF',
});
