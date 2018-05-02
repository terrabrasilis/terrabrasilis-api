## Instalations

```sh

npm install --save terrabrasilis-api

```

## Using the module

#### In Node.js

```sh
var Terrabrasilis = require('terrabrasilis-api');


Terrabrasilis
    .map() 
    .addBaseLayers()
    .addOverLayers()
    .enableDrawFeatureTool()
    .enableLayersControlTool()
    .enableScaleControlTool()
    .enableGeocodingTool();

```

## Release History

* 0.0.1 Initial release
