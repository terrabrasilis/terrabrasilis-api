## Instalations

Access NPM: https://www.npmjs.com/package/terrabrasilis-api 

```sh

npm install --save terrabrasilis-api

```

## Using the module

```json
let overlayers = [{
     "title":"",
     "name":"",
     "host":"",
     "legend_color":"",
     "workspace":"",
     "active":true,
     "subdomains":null,
     "baselayer":false,
     "attribution":"",
     "opacity": 0.9
}]
```

#### In Node.js

```sh
var Terrabrasilis = require('terrabrasilis-api');

// just standard config
Terrabrasilis
    .map() 
    .addBaseLayers()
    .addOverLayers()
    .enableDrawFeatureTool()
    .enableLayersControlTool()
    .enableScaleControlTool()
    .enableGeocodingTool();
    
// mount a simple map 
Terrabrasilis
     .map(lat, lon, zoom, 'div to mount the map') 
     .addBaseLayers()
     .addOverLayers(overlayers)
     .hideStandardLayerControl(); // disable LayerControl

// mount GeoJson layers (example)
geojsonLayers = [{
           "type":"point",     
           "name":"cities",
           "active": true,
           "features":["all features points"]
     }];
Terrabrasilis
    .map()
    .addGeoJsonLayers(geojsonLayers);

```

## Release History

Travis CI: [![Build Status](https://travis-ci.org/Terrabrasilis/terrabrasilis-api.svg?branch=master)](https://travis-ci.org/Terrabrasilis/terrabrasilis-api)

* 0.0.1 Initial release 
* 0.0.2 release
* ...
* 0.0.26 release
* 0.0.27 release
* 0.0.28 release
* 0.0.29 release
* 0.1.0 release [latest]
