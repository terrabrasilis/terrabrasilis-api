const { Stack, Queue, TilesWorkerPool } = require('terrabrasilis-util')
const L = require('leaflet')
require('terrabrasilis-timedimension')
require('terrabrasilis-map-plugins')
const leafletEsriGeocoding = require('esri-leaflet-geocoder')
const utils = require('./src/utils')
const ApiException = require("./src/api-exception")
const { get, set } = require('lodash')
const turf = require('./src/turf')
const { stat } = require('fs')

/**
 * This class use the Revealing Module Pattern.
 *
 * https://scotch.io/bar-talk/4-javascript-design-patterns-you-should-know#module-design-pattern
 */
var Terrabrasilis
Terrabrasilis = (function () {
  /**
     * variables
     */
  let map;
  let mapScaleStack;
  let redoScaleQueue;
  let baseLayersToShow;
  let overLayersToShow;
  let legendToShow;
  let layerControl;
  let stateChangedCallback;
  let dl=document.location;
  let base_url=(dl.hostname!='localhost')?(dl.protocol+'//'+dl.hostname):(dl.protocol+'//terrabrasilis.dpi.inpe.br');
  const defaultLat = -52.685277;
  const defaultLon = -11.678782;
  const defaultZoom = 5;
  const defaultMapContainer = 'map';
  const constants = {
    PROXY: base_url+'/proxy'
  }
  let resultsGetFeatureInfo

  /* dashboard map */
  const info = L.control()
  const legend = L.control({ position: 'bottomright' })
  const grades = []
  let colors = []

  /* to control the enable or disable TimeDimension component */
  const _ctrlTimer = {
    // The Time Dimension control
    control: null,
    // The layer name of the activated Time Dimension layer
    layerName: null,
    // The exists instance of the Leaflet Layer used to restore into map
    leafletLayer: null,
    // The created instance of the TimeDimension layer
    timeDimensionLayer: null,
    // The Time Dimension instance
    timeDimension: null
  }
  const _timeConfigLayers = {}// store the default configurations for construct the TimeDimension layers when its needed.
  // let _overLayers = {};// The created instances of the WMS Leaflet Layer.

  // For Drawing tools
  let drawnItems
  let drawControl

  /// ////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Terrabrasilis map
  /// ////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  /**
     * this method start the mount terrabrasilis map
     *
     * @param {*} lat
     * @param {*} lon
     * @param {*} zoom
     */
  const mountMap = function (lat, lon, stateChangedCallback, zoom, container) {
    if (typeof (lat) === 'undefined' || lat === null) { lat = defaultLat }

    if (typeof (lon) === 'undefined' || lon === null) { lon = defaultLon }

    if (typeof (zoom) === 'undefined' || zoom === null) { zoom = defaultZoom }

    if (typeof (container) === 'undefined' || container === null) { container = defaultMapContainer }

    this.stateChangedCallback = stateChangedCallback;

    //this.initWMSLayerType();

    // icons: https://icons8.com/icon/set/map/metro
    map = L.map(container, {
      scrollWheelZoom: true,
      fullscreenControl: {
        pseudoFullscreen: false
      },
      contextmenu: true,
      contextmenuWidth: 200,
      contextmenuItems: [{
        text: 'Show coordinates',
        icon: 'assets/img/leaflet/context.menu/whereiam.png',
        callback: showCoordinates
      }, {
        text: 'Center map here',
        icon: 'assets/img/leaflet/context.menu/center.png',
        callback: centerMap
      }, '-', {
        text: 'GetFeatureInfo',
        icon: 'assets/img/leaflet/context.menu/info.png',
        callback: getLayerFeatureInfo
      }]
    }).setView([lon, lat], zoom)



    localStorage.setItem('lat', lat)
    localStorage.setItem('lon', lon)
    localStorage.setItem('zoom', zoom)

    mapScaleStack = Stack
    redoScaleQueue = Queue

    map.on('zoomend', function (event) {
      const options = {
        lat: localStorage.getItem('lat'),
        lng: localStorage.getItem('lon'),
        zoom: map.getZoom()
      }

      // console.log(map);

      mapScaleStack.insert(options)
      redoScaleQueue.insert(options)

      // console.log("add scale -> " + map.getZoom());
    })

    if(this.stateChangedCallback!=null)
    {
      map.on('zoomend', this.stateChangedCallback);

      map.on('moveend', this.stateChangedCallback);
    }

    resultsGetFeatureInfo = L.layerGroup().addTo(map)

    return this
  }

  /**
    * This method is used to mount all base layers to use in the terrabrasilis map
    * @param {*} baseLayersOptions
    */
  /*
    JSON baselayers example
    [
        {
            "id":"",
            "name":"Google Satellite",
            "title":"Google Satellite",
            "description":"",
            "attribution":"",
            "workspace":"",
            "capabilitiesUrl":"",
            "opacity":0.9,
            "baselayer":true,
            "active":false,
            "enable":true,
            "created":"",
            "datasource":{
                "id":"5c489b1ebbfeb44c9df6aa5c",
                "name":"Google Satellite",
                "description":"Google Satellite",
                "host":"https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
                "metadata":"",
                "enabled":true,
                "created":"2019-01-23 16:49:34",
                "downloads":[

                ],
                "tools":[

                ]
            },
            "tools":[

            ],
            "subdomains":[
                "mt0",
                "mt1",
                "mt2",
                "mt3"
            ],
            "metadata":"",
            "dashboard":"",
            "thirdHost":"",
            "uiOrder":0,
            "stackOrder":0,
            "isRemovable":false,
            "hasTranslate":true
        }
    ]
    */
  const mountBaseLayers = function (baseLayersOptions) {
    const styledBaselayers = []
    const layersGroup = {
      groupName: 'BASELAYERS',
      expanded: false
    }
    var baselayers = {}

    if (typeof (baseLayersOptions) === 'undefined' || baseLayersOptions === null) {
      // console.log("no objects defined to mount baselayers so using the OSM baselayer to up the app!")
      baselayers = {
        'OSM Default': L.tileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, ' +
                                        '<a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, ',
          maxZoom: 18,
          minZoom: 4 })
      }
      baselayers['OSM Default'].addTo(map)
      layersGroup.layers = baselayers
      styledBaselayers.push(layersGroup)
      baseLayersToShow = styledBaselayers
      return this
    }

    for (const key in baseLayersOptions) {
      if (baseLayersOptions.hasOwnProperty(key)) {
        const bl = baseLayersOptions[key]

        if (bl.baselayer) {
          const options = {
            attribution: bl.attribution === null ? '' : bl.attribution,
            maxZoom: 18,
            minZoom: 4,
            _name: bl.name,
            _baselayer: bl.baselayer
          }
          if (bl.subdomains != null && bl.subdomains.length > 0) {
            options.subdomains = bl.subdomains
          }
          // console.log(options);
          const host = bl.datasource === null ? '' : bl.datasource.host
          var baselayer = L.tileLayer(host, options)
          baselayers[bl.title] = baselayer
        }
      }
    };
    layersGroup.layers = baselayers
    styledBaselayers.push(layersGroup)
    baseLayersToShow = styledBaselayers

    for (const key in baseLayersOptions) {
      if (baseLayersOptions.hasOwnProperty(key)) {
        const toShow = baseLayersOptions[key]
        if (toShow.active) {
          baselayers[toShow.title]
            .addTo(map)
            .bringToBack()
        }
      }
    }

    return this
  }

  /**
    * This method is used to mount all base layers to use in the terrabrasilis map
    * @param {*} baseLayersOptions
    */
  /*
    JSON baselayers example
    [
        {
            "id":"",
            "name":"Google Satellite",
            "title":"Google Satellite",
            "description":"",
            "attribution":"",
            "workspace":"",
            "capabilitiesUrl":"",
            "opacity":0.9,
            "baselayer":true,
            "active":false,
            "enable":true,
            "created":"",
            "datasource":{
                "id":"5c489b1ebbfeb44c9df6aa5c",
                "name":"Google Satellite",
                "description":"Google Satellite",
                "host":"https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
                "metadata":"",
                "enabled":true,
                "created":"2019-01-23 16:49:34",
                "downloads":[

                ],
                "tools":[

                ]
            },
            "tools":[

            ],
            "subdomains":[
                "mt0",
                "mt1",
                "mt2",
                "mt3"
            ],
            "metadata":"",
            "dashboard":"",
            "thirdHost":"",
            "uiOrder":0,
            "stackOrder":0,
            "isRemovable":false,
            "hasTranslate":true
        }
    ]
    */
  const mountCustomizedBaseLayers = function (baseLayersOptions) {
    var baselayers = {}

    if (typeof (baseLayersOptions) === 'undefined' || baseLayersOptions === null) {
      // console.log("no objects defined to mount baselayers so using the OSM baselayer to up the app!")
      baselayers = {
        'OSM Default': L.tileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, ' +
                                        '<a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, ',
          maxZoom: 18,
          minZoom: 4 })
      }
      baselayers['OSM Default'].addTo(map)
      return this
    }

    for (const key in baseLayersOptions) {
      if (baseLayersOptions.hasOwnProperty(key)) {
        const bl = baseLayersOptions[key]

        if (bl.baselayer) {
          const options = {
            attribution: bl.attribution === null ? '' : bl.attribution,
            maxZoom: 18,
            minZoom: 4,
            _name: bl.name,
            _baselayer: bl.baselayer
          }
          if (bl.subdomains != null && bl.subdomains.length > 0) {
            options.subdomains = bl.subdomains
          }
          // console.log(options);
          const host = bl.datasource === null ? '' : bl.datasource.host
          var baselayer = L.tileLayer(host, options)
          baselayer.setZIndex(0)
          baselayers[bl.title] = baselayer

          switchToAuthenticatedLayer(baselayer, bl, AuthenticationService.isAuthenticated());

        }
      }
    };

    for (const key in baseLayersOptions) {
      if (baseLayersOptions.hasOwnProperty(key)) {
        const toShow = baseLayersOptions[key]
        if (toShow.active) {
          baselayers[toShow.title]
            .addTo(map)
            .bringToBack()
        }
      }
    }

    return this
  }

  /**
     * This method is used to mount all overlayers to use in the terrabrasilis map
     *
     * @param {*} overLayersOptions
     */
  /*
    JSON overlayers example
    [
        {
            "id" : "5c49f5bc1a21020001cd6638",
            "name" : "yearly_deforestation_2013_2018",
            "title" : "AMZ Yearly Deforestation",
            "description" : "AMZ Yearly Deforestation",
            "attribution" : "",
            "workspace" : "prodes-amz",
            "capabilitiesUrl" : "",
            "stackOrder" : 2,
            "opacity" : 1.0,
            "baselayer" : false,
            "active" : true,
            "enabled" : true,
            "created" : "2019-01-24 17:28:28",
            "datasource" : {
                "id" : "5c409e920e9b2a0b8424ef1b",
                "name" : "Prodes Amazonia",
                "description" : "Prodes Amazonia",
                "host" : "http://terrabrasilis.dpi.inpe.br/geoserver/ows",
                "metadata" : "",
                "enabled" : true,
                "created" : "2019-01-17 15:26:10",
                "downloads" : [ ],
                "tools" : [ ]
            },
            "tools" : [ ],
            "subdomains" : [ ],
            "metadata":"",
            "dashboard":"",
            "thirdHost":"",
            "uiOrder":0,
            "stackOrder":0,
            "isRemovable":false,
            "hasTranslate":true
        }
    ]
    */
  const mountOverLayers = function (overLayersOptions) {
    const styledOverlayers = []
    const layersGroup = {
      groupName: 'PRODES AMZ',
      expanded: true
    }
    let overlayers = {}

    const legend = L.control.htmllegend({
      position: 'bottomright',
      collapseSimple: true,
      detectStretched: true,
      collapsedOnInit: true,
      defaultOpacity: 1.0,
      visibleIcon: 'icon icon-eye',
      hiddenIcon: 'icon icon-eye-slash'
    })

    if (typeof (overLayersOptions) === 'undefined' || overLayersOptions === null) {
      overlayers = null
      // console.log("no objects defined to mount overlayers!")
      return this
    }

    let zIndexCount = 199
    for (const key in overLayersOptions) {
      if (overLayersOptions.hasOwnProperty(key)) {
        const ol = overLayersOptions[key]

        let layerName = getLayerName(ol);
     
        if (!ol.baselayer) {
          const options = {
            id: ol.id,
            layers: ol.workspace + ':' + layerName,
            format: 'image/png',
            transparent: true,
            tiled: true,
            _name: layerName,
            _baselayer: ol.baselayer,
            zIndex: zIndexCount++
          }

          

          if (ol.subdomains != null) {
            if (ol.subdomains.length > 0) {
              options.subdomains = ol.subdomains;
            }
          }


          headers=[]

          if(this.headersWithAuths)
          {
            headers = this.headersWithAuths
          }

          var overlayer = new L.wmsHeader(ol.host, options, headers, null)
          overlayers[ol.id] = overlayer;

          switchToAuthenticatedLayer(overlayer, ol, AuthenticationService.isAuthenticated());

          legend.addLegend({
            name: ol.title,
            layer: overlayer,
            opacity: ol.opacity,
            elements: [{
              // label: 'value' //if define label, the presentation of legend change
              html: '',
              style: {
                'background-color': ol.legend_color,
                width: '10px',
                height: '10px'
              }
            }]
          })
        }
      }
    };
    layersGroup.layers = overlayers;
    styledOverlayers.push(layersGroup);
    overLayersToShow = styledOverlayers;
    legendToShow = legend;

    for (const key in overLayersOptions) {
      if (overLayersOptions.hasOwnProperty(key)) {
        const toShow = overLayersOptions[key];
        if (toShow.active) {
          overlayers[toShow.id].addTo(map);
        }
      }
    }

    return this;
  }

  /**
     * This method is used to mount all overlayers to use in the terrabrasilis map
     * About the stackOrder parameter:
     * To control the display order of layers into map use bigger values to putting the layer over the others and the minor values to put below.
     *
     * @param {*} overLayersOptions
     */
  /*
    JSON overlayers example
    [
        {
            "id" : "5c49f5bc1a21020001cd6638",
            "name" : "yearly_deforestation_2013_2018",
            "title" : "AMZ Yearly Deforestation",
            "description" : "AMZ Yearly Deforestation",
            "attribution" : "",
            "workspace" : "prodes-amz",
            "capabilitiesUrl" : "",
            "stackOrder" : 2,
            "opacity" : 1.0,
            "baselayer" : false,
            "active" : true,
            "enabled" : true,
            "created" : "2019-01-24 17:28:28",
            "datasource" : {
                "id" : "5c409e920e9b2a0b8424ef1b",
                "name" : "Prodes Amazonia",
                "description" : "Prodes Amazonia",
                "host" : "http://terrabrasilis.dpi.inpe.br/geoserver/ows",
                "metadata" : "",
                "enabled" : true,
                "created" : "2019-01-17 15:26:10",
                "downloads" : [ ],
                "tools" : [ ]
            },
            "tools" : [ ],
            "subdomains" : [ ],
            "metadata":"",
            "dashboard":"",
            "thirdHost":"",
            "uiOrder":0,
            "stackOrder":0,
            "isRemovable":false,
            "hasTranslate":true
        }
    ]
    */
  const mountCustomizedOverLayers = function (overLayersOptions) {
    let overlayers = {}

    if (typeof (overLayersOptions) === 'undefined' || overLayersOptions === null) {
      overlayers = null
      // console.log("no objects defined to mount overlayers!")
      return this
    }

    for (const key in overLayersOptions) {
      if (overLayersOptions.hasOwnProperty(key)) {
        const ol = overLayersOptions[key]
        // console.log(ol);
        if (!ol.baselayer) {

          let layerName = getLayerName(ol);
     
          const options = {
            id: ol.id,
            layers: ol.workspace + ':' + layerName,
            format: 'image/png',
            transparent: true,
            tiled: true,
            _name: layerName,
            _baselayer: ol.baselayer,
            zIndex: ol.stackOrder
          }

          if(ol.filter)
          {
            options.time=ol.filter.time;
          }

          if (ol.subdomains != null) {
            if (ol.subdomains.length > 0) {
              options.subdomains = ol.subdomains;
            }
          }

          headers=[]

          if(this.headersWithAuths)
          {
            headers = this.headersWithAuths
          }

          const host = ol.datasource.host; //.replace('ows', 'gwc/service/wms')
          var overlayer = new L.wmsHeader(host, options, headers, null);
          overlayers[ol.id] = overlayer;
          if (ol.timeDimension) {
            // Show one button to enable/disable the TimerControl over map.
            _timeConfigLayers[ol.id] = ol;
          }
          switchToAuthenticatedLayer(overlayer, ol, AuthenticationService.isAuthenticated());
        }
      }
    };

    for (const key in overLayersOptions) {
      if (overLayersOptions.hasOwnProperty(key)) {
        const toShow = overLayersOptions[key]
        if (toShow.active) {
          overlayers[toShow.id].addTo(map);
        }
      }
    }

    
    
    return this
  }

  const getLayerName = function(l)
  {
    
    if(l.nameAuthenticated && l.nameAuthenticated.length>0)
    {
      if(AuthenticationService.isAuthenticated())
      {
        return l.nameAuthenticated;
      }
      else
      {
        return l.name;
      } 
      }
    else
    {
      return l.name;
    }
    
  }

  /**
     * Reorders the list layers inside the map to change the layers stacking order on the viewer.
     * Expect the stackOrder numeric parameter for each layer to define the zIndex for each layer inside the map.
     * @param {*} layers One list of layers from external application.
     */
  const reorderOverLayers = function (layers) {
    map.eachLayer(layer => {
      const oLayer = layers.find(l => {
        if (l.name === layer.options._name) return l
      })
      // set zindex into layer of the map reading stackOrder property from the external Layer definition
      if (oLayer) {
        layer.setZIndex(oLayer.stackOrder)
      }
    })
  }

  /**
     * this method enables the features highlight
     */
  const geojsonHighlightFeature = function (e) {
    const layer = e.target

    layer.setStyle({
      weight: 5,
      color: '#666',
      dashArray: '',
      fillOpacity: 0.7
    })

    if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
      layer.bringToFront()
    }

    info.update(layer.feature.properties)
  }

  /**
     * this method resets to features highlight
     */
  const geojsonResetHighlight = function (e) {
    var layer = e.target

    layer.setStyle({
      color: '',
      fillOpacity: 0.7
    })

    info.update()
  }

  /**
     * this method zooms to feature
     */
  const geojsonZoomToFeature = function (e) {
    map.fitBounds(e.target.getBounds())
  }

  /**
     * this method applies handlers on each features
     */
  const onEachFeature = function (feature, layer) {
    layer.on({
      mouseover: geojsonHighlightFeature,
      mouseout: geojsonResetHighlight,
      click: geojsonZoomToFeature
    })
  }

  /**
     * this method builds info
     */
  const buildInfo = function () {
    // creates an info div
    info.onAdd = function (map) {
      this._div = L.DomUtil.create('div', 'info') // create a div with a class "info"
      this.update()
      return this._div
    }

    // updates a div info
    info.update = function (props) {
      this._div.innerHTML = (props ? '<b>' + props.name + '</b><br/>' + props.density.toFixed(2) + ' km²' : '')
    }
  }

  /**
    * this method sets grades values
    */
  const setGradesLegend = function (max, number) {
    // define initial settings
    var delta = ~~(max / number)
    grades[0] = 0
    for (var j = 1; j <= number; j++) { // repeat number times
      grades[j] = grades[j - 1] + delta // sum grades previous values
    }
  }

  /**
    * this method gets grades values
    */
  const getGradesLegend = function () {
    return grades
  }

  /**
    * this method set color legend
    */
  const setColorLegend = function (col) {
    colors = col
  }

  /**
    * this method gets color legends
    */
  const getColorLegend = function (elem) {
    var index
    for (var i = grades.length - 1; i >= 0; i--) {
      if (elem >= grades[i]) {
        index = i
        break
      }
    }
    return colors[index]
  }

  /**
    * add legend
    */
  legend.onAdd = function (map) {
    var div = L.DomUtil.create('div', 'info legend') // create a div

    // loop through grades intervals and generate a label with a colored square for each interval
    div.innerHTML += '<b>Min &ndash; Max (km²)</b><br>'
    for (var i = 0; i < grades.length; i++) {
      div.innerHTML += '<i style="background:' + colors[i] + '"></i> ' + grades[i] + (grades[i + 1] ? ' &ndash; ' + grades[i + 1] + '<br>' : '+')
    }

    return div
  }

  /**
     * This method is used to mount geoJson overlayers to use in the terrabrasilis map
     *
     * [{
     *      "type":"",
     *      "name":"",
     *      "active": (true, false),
     *      "style":"",
     *      "features":[]
     *  }]
     */
  const mountGeoJsonLayers = function (geoJson) {
    let overlayers = {}

    if (typeof (geoJson) === 'undefined' || geoJson === null) {
      overlayers = null
      // console.log("no objects defined to mount GeoJSON overlayers!")
      return this
    }

    for (const key in geoJson) {
      if (geoJson.hasOwnProperty(key)) {
        const ol = geoJson[key]

        var overlayer = L.geoJson(ol.features,
          { style: ol.style,
            onEachFeature: onEachFeature })
        overlayers[ol.name] = overlayer
      }
    };

    for (const key in geoJson) {
      if (geoJson.hasOwnProperty(key)) {
        const toShow = geoJson[key]
        if (toShow.active) {
          overlayers[toShow.name].addTo(map)
          map.fitBounds(overlayers[toShow.name].getBounds())
          buildInfo()
          info.addTo(map)
          legend.addTo(map)
        }
      }
    }

    return this
  }

  const disableDrawFeatureTool = function () {
    map.removeLayer(drawnItems)

    map.removeControl(drawControl)

    map.off(L.Draw.Event.CREATED)

    map.off(L.Draw.Event.EDITED)

    map.off(L.Draw.Event.DELETED)

    drawnItems = null
    drawControl = null
  }

  /**
     * This method allow to use the draw tools
     * To listen events generated by the Drawing tasks, you should provide a listener parameter.
     * @param listener, An Object with one or more members to attach on to map draw events.
     */
  const enableDrawnFeature = function (listener) {
    var LeafIcon = L.Icon.extend({
      options: {
        shadowUrl: 'assets/img/leaflet/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12.5, 41],
        popupAnchor: [-1, -41],
        shadowSize: [41, 41],
        shadowAnchor: [12.5, 41]
      }
    })

    var TBIcon = new LeafIcon({
      iconUrl: 'assets/img/leaflet/marker-icon.png'
    })

    drawnItems = new L.FeatureGroup()
    map.addLayer(drawnItems)

    // const options = {
    //   draw: {
    //     polygon: {
    //       allowIntersection: false,
    //       drawError: {
    //         color: '#e1e100',
    //         message: '<strong>Oh snap!<strong> you can\'t draw that!'
    //       },
    //       shapeOptions: {
    //         clickable: true,
    //         showArea: true,
    //         color: '#bada55'
    //       },
    //       showArea: true
    //     },
    //     polyline: {
    //       shapeOptions: {
    //         clickable: true,
    //         showArea: true,
    //         color: '#f357a1',
    //         weight: 7
    //       },
    //       showArea: true
    //     },
    //     rectangle: {
    //       shapeOptions: {
    //         clickable: true,
    //         showArea: true
    //       },
    //       showArea: true
    //     },
    //     marker: {
    //       icon: TBIcon
    //     },
    //     circle: false
    //   },
    //   metric: true,
    //   edit: {
    //     featureGroup: drawnItems,
    //     edit: true,
    //     remove: true,
    //     buffer: {
    //       replace_polylines: false,
    //       separate_buffer: true,
    //       buffer_style: {
    //         // renderer: renderer,
    //         // color: color,
    //         weight: 5,
    //         fillOpacity: 0,
    //         dashArray: '5, 20'
    //       }
    //     }
    //   }
    // }

    /////////////////////////////////////////////////////////////////////////////
    // Terrabrasilis time series
    /////////////////////////////////////////////////////////////////////////////

    const options = {
      draw: {
        polygon: {
          metric: true,
          allowIntersection: false,
          showArea: true,
          drawError: {
            color: '#b00b00',
            timeout: 1000,
            message: '<strong>Oh snap!<strong> you can\'t draw that!'
          },
          shapeOptions: {
            color: '#000000',
            fill: false,
          }  
        },
        polyline: false, 
        rectangle: {
          metric: true,
          showArea: true,
          shapeOptions: {
            clickable: true,
            color: '#000000',
            fill: false,
          }
        },
        marker: {
          icon: TBIcon
        },
        circle: false,
        // {
        //   metric: true,
        //   showArea: true,
        //   shapeOptions: {
        //     color: '#000000',
        //     fill: false,
        //   }
        // }
      },
      edit: {
        featureGroup: drawnItems,
        edit: false,
        remove: false,
      }
    }


    var turfLayer = L.geoJson(null, {
      style: function (feature) {
        var style = {
          color: '#1e1e1e', //'#00FFFF',
          //fillColor: null,
          weight: 3,
          fillOpacity: .0
        };
        return style;
      }
    }).addTo(map);

    // geojson to leaflet and return a CircleMarker in center of each square 
    var centroidsLayer = L.geoJson(null, {
      style: function(feature) {
          return {color: "#910000"};
      },
      pointToLayer: function(feature, latlng) {
          return new L.CircleMarker(latlng, {radius: 3, fillOpacity: 1});
      },
      // onEachFeature: function (feature, layer) {
      //     layer.bindPopup(feature.geometry.coordinates);
      // }
    }).addTo(map);

    var jsonCoords = null;
    
    //----- get points from polygon using a grid
    function getPointsPolygon(layer, measure) {

      // internal buffer to get MODIS pixel only within polygon
      var buffered = turf.buffer(layer.toGeoJSON(), measure, { units: 'meters' });
      //turfLayer.addData(buffered);
      //console.log('buffered: ', buffered); //JSON.stringify(buffered));

      // create bounding box of buffer layer
      var bbox = turf.bboxPolygon(turf.bbox(buffered));
      //console.log('bbox: ', bbox);

      // pass to array type
      var bbox_array = bbox.geometry.coordinates[0];
      //console.log('bbox_array: ', JSON.stringify(bbox_array));
      var array = [];
      array = bbox_array[0].concat(bbox_array[2]);

      // set options to squareGrid turf.js
      var options = {
        units: 'meters',
        mask: buffered, // use buffer as mask
      };
      var cellSide = 250;

      var squareGrid = turf.squareGrid(array, cellSide, options);
      turfLayer.addData(squareGrid);
      //console.log('squareGrid: ', squareGrid);

      console.log('Amount of features: ', squareGrid.features.length);

      // consider all squares and put a unique centroid for each one
      var allFeatures = [];
      for (var i = 0; i <= squareGrid.features.length; i++){
        var feature = squareGrid.features[i];
        if (typeof feature !== 'undefined') {
          var polygon = turf.polygon(feature.geometry.coordinates);
          allFeatures[i] = turf.centroid(polygon);
          // console.log('all features: ', allFeatures);
        }}
      // show points over map
      centroidsLayer.addData(allFeatures);

      //jsonCoords = JSON.parse(JSON.stringify(allFeatures));
      jsonCoords = JSON.stringify(allFeatures);
      // console.log('GeoJSON coordinates from polygon: ', jsonCoords);
      // test at https://utahemre.github.io/geojsontest.html
      
      // localStorage.setItem('jsonCoords', jsonCoords)
//     return jsonCoords;
    }

  //----- create a new shapefile
  map.on("draw:created", function (e) {

    var layerShp = e.layer;
    //console.log('shp1: ', layerShp);
    drawnItems.clearLayers();
    turfLayer.clearLayers();
    centroidsLayer.clearLayers();

    layerShp.addTo(drawnItems);

    var type = e.layerType;
    var area = 0;

    if (type === 'polygon' || type === 'rectangle') {
      
      area = L.GeometryUtil.geodesicArea(layerShp.getLatLngs()[0]); // meters by default
      var areaInHa = (area / 10000).toFixed(2)

      if (areaInHa >= 2000 | areaInHa <= 50) {
        //console.log("Area " + areaInHa + " ha is more than 2000 ha or less than 50 ha.");
        //alert('Area has ' + areaInHa + ' ha!\nPlease, draw a polygon with an area between 50 and 2000 ha.');
        localStorage.setItem('jsonCoords', "");
        drawnItems.clearLayers();
        turfLayer.clearLayers();
        centroidsLayer.clearLayers();
      } else {
        //-- internal buffer to get MODIS pixel only within polygon
        getPointsPolygon(layerShp, -200);
        console.log('Area Hectares:', areaInHa, "ha to: ", type);
        localStorage.setItem('jsonCoords', jsonCoords);
      }
    } 
  });
  /////////////////////////////////////////////////////////////////////////////

    drawControl = new L.Control.Draw(options)
    map.addControl(drawControl)

    if (listener && listener.onCreate) {
      map.on(L.Draw.Event.CREATED, function (event) {
        listener.onCreate(event)
      })
    }
    if (listener && listener.onEdit) {
      map.on(L.Draw.Event.EDITED, function (event) {
        listener.onEdit(event)
      })
    }
    if (listener && listener.onDelete) {
      map.on(L.Draw.Event.DELETED, function (event) {
        listener.onDelete(event)
      })
    }

    map.on(L.Draw.Event.CREATED, function (event) {
      // const type = event.layerType
      const layer = event.layer
      // console.log(type);
      // console.log(JSON.stringify(layer.toGeoJSON()));
      // console.log(toWKT(layer));
      drawnItems.addLayer(layer)
    })

    // map.on(L.Draw.Event.EDITED, function (event) {
    //   const editedLayers = event.layers
    // editedLayers.eachLayer(function (l) {
    // const layer = event.layer
    // console.log(JSON.stringify(layer.toGeoJSON()));
    // let wkt = getTerraformerWKT(l);
    // console.log(wkt);
    // })
    // })

    map.on(L.Draw.Event.DELETED, function (event) {
      const deletedLayers = event.layers

      deletedLayers.eachLayer(function (l) {
        drawnItems.removeLayer(l)
        // console.log("Deleting feature: ", l);
      })
    })

    return this
  }

  /**
     * this method enable the leaflet layers control
     */
  const enableLayersControl = function () {
    /**
         * davicustodio.github.io/Leaflet.StyledLayerControl/examples/example2.html
         * Using styled layer group
         */
    var options = {
      container_width: '300px',
      group_maxHeight: '300px',
      exclusive: true,
      // sortLayers          : true,
      collapsed: true
    }

    layerControl = L.control.layers(baseLayersToShow, overLayersToShow, options).addTo(map)
    // layerControl = L.Control.styledLayerControl(baseLayersToShow, overLayersToShow, options).addTo(map);

    return this
  }

  const enableLegendAndToolToLayers = function () {
    if (typeof (legendToShow) === 'undefined' || legendToShow === null) {
      overlayers = null
      return this
    }

    map.addControl(legendToShow)
    return this
  }

  const enableZoomBox = function () {
    L.Control.boxzoom({
        position:'topleft',
    }).addTo(map)

    return this
  }

  /**
     * this method enable the scale leaflet control
     */
  const enableScaleControl = function () {
    L.control.scale().addTo(map)
    return this
  }

  /**
     * Enable show coordinates
     */
  const enableDisplayMouseCoordinates = function () {
    L.control.coordinates({
      position: 'bottomright',
      decimals: 6,
      decimalSeperator: '.',
      labelTemplateLat: 'Lat: {y}',
      labelTemplateLng: 'Lng: {x}'
    }).addTo(map)

    return this
  }

  /**
     * this method enable search location using esri-leaflet plugin
     */
  const enableGeocodingControl = function () {
    const searchControl = leafletEsriGeocoding.geosearch().addTo(map)

    const results = L.layerGroup().addTo(map)

    searchControl.on('results', function (data) {
      results.clearLayers()
      // console.log(data);
      for (var i = data.results.length - 1; i >= 0; i--) {
        const marker = L.marker(data.results[i].latlng)
          .bindPopup('<strong>' + data.results[i].properties.LongLabel + '</strong>' +
                                    '<br>[ ' + data.results[i].latlng.lat + ' ][ ' + data.results[i].latlng.lng + ' ]').openPopup()

        results.addLayer(marker)
      }

      // setTimeout(function(){
      //     console.log("cleaning the search result layer");
      //     results.clearLayers();
      // }, 10000);
    })

    return this
  }

  /// ////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // General tools
  /// ////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  /**
     * this method allow to resetView to the initial lat, lon and zoom given by user
     */
  const resetMapToInitialView = function () {
    map.setView([
      localStorage.getItem('lon'),
      localStorage.getItem('lat')],
    localStorage.getItem('zoom'))

    mapScaleStack.reset()
    redoScaleQueue.reset()
    // console.log("Reset stack and queue.");
  }

  /**
     * this method allow do the fullscreen
     */
  const goToFullscreen = function () {
    if (map.isFullscreen()) {
      map.toggleFullscreen()
    } else {
      map.toggleFullscreen()
    }
  }

  /**
     * http://terraformer.io/
     *
     * This method receive a GeoJSON string and return the Terraformer WKT
     *
     * @param layer
     */
  // const getTerraformerWKT = function (layer) {
  //   return Terraformer.WKT.convert(layer.toGeoJSON().geometry)
  // }

  /**
     * This method show the lat lon - just test with context menu
     *
     * @param event
     */
  const showCoordinates = function (event) {
    const popupTemplate = L.DomUtil.create('div', '')
    popupTemplate.innerHTML = 'Lat: ' + event.latlng.lat + '<br/>Lng: ' + event.latlng.lng
    const copyInfo = L.DomUtil.create('div', '', popupTemplate)
    copyInfo.innerHTML = 'Click to copy: '

    // This component will be positioned out of viewport.
    const inputText = L.DomUtil.create('textarea', '', popupTemplate)
    inputText.value = event.latlng.lat + ',' + event.latlng.lng
    inputText.setAttribute('readonly', '')
    inputText.setAttribute('style', 'position:absolute;left:-9999px;')

    const onClick = function (e) {
      inputText.select()
      copyInfo.innerHTML = ((document.execCommand('copy')) ? ('Copied!') : ('Failure on copy!'))
    }

    const iconCopy = L.DomUtil.create('i', 'fa fa-clipboard', copyInfo)
    iconCopy.setAttribute('aria-hidden', 'true')
    iconCopy.setAttribute('style', 'cursor:pointer;')
    iconCopy.setAttribute('title', 'Click to copy coordinates.')
    iconCopy.addEventListener('click', onClick)

    L.popup({ width: 320 })
      .setLatLng(event.latlng)
      .setContent(popupTemplate)
      .openOn(map)
  }

  /**
     * This method centralizes the map in the clicked point
     *
     * @param event
     */
  const centerMap = function (event) {
    this.setView([event.latlng.lat, event.latlng.lng], localStorage.getItem('zoom'))
  }

  /**
     * This method back to the last scale position
     *
     * @param {*} event
     */
  const undo = function () {
    let letsGoTo = mapScaleStack.remove()
    // console.log("undo to -> ");
    // console.log(letsGoTo)

    if (letsGoTo !== 'undefined') {
      if (letsGoTo.zoom === map.getZoom()) { letsGoTo = mapScaleStack.remove() }
      map.setView([
        letsGoTo.lng,
        letsGoTo.lat]
      , letsGoTo.zoom)
    }
  }

  /**
     * This method allow walking in undo and redo scale map
     *
     * @param {*} event
     */
  const redo = function () {
    let letsGoTo = redoScaleQueue.remove()
    // console.log("redo to -> ");
    // console.log(letsGoTo)

    if (letsGoTo !== 'undefined') {
      if (letsGoTo.zoom === map.getZoom()) { letsGoTo = redoScaleQueue.remove() }
      map.setView([
        letsGoTo.lng,
        letsGoTo.lat]
      , letsGoTo.zoom)
    }
  }

  /**
     * This method get the feature layer info (just selected layers)
     *
     * @param event, the event when click occurs.
     */
  const getLayerFeatureInfo = function (event) {
    // Define default icons to instruct the webpack to copy this icon files from assets to bundle.
    var tbIcon = L.icon({
      iconUrl: 'assets/img/leaflet/marker-icon.png',
      iconRetinaUrl: 'assets/img/leaflet/marker-icon-2x.png',
      iconSize: [25, 41],
      iconAnchor: [12.5, 41],
      popupAnchor: [-1, -41],
      shadowUrl: 'assets/img/leaflet/marker-shadow.png',
      shadowSize: [41, 41],
      shadowAnchor: [12.5, 41]
    })

    const urls = getFeatureInfoUrlJson(event)

    const popupTemplate = L.DomUtil.create('div', 'table-responsive')
    popupTemplate.setAttribute('id', 'getfeatureinfo')

    const loading = L.DomUtil.create('div', 'lds-dual-ring', popupTemplate)
    loading.setAttribute('id', 'popuploading')

    const popupOptions = {
      maxWidth: 'auto',
      minWidth: 450,
      autoClose: false
    }
    const popup = L.popup(popupOptions).setLatLng(event.latlng).setContent(popupTemplate)

    const onOpen = function (e) {
      // if is the first time, so will request feature infos otherwise abort.
      if (popupTemplate.childElementCount > 1) {
        return false
      }
      var authorization = "Bearer "+AuthenticationService.getToken();
            
      urls.forEach(url => {
        const urlToGetInfo = constants.PROXY + '?url=' + encodeURIComponent(url)
       // const urlToGetInfo = "http://localhost/cgi-bin/proxy.cgi" + '?url=' + encodeURIComponent(url)
        const table = L.DomUtil.create('table', 'table table-striped table-info')
        const tableBody = L.DomUtil.create('tbody', '', table)

        $.ajax({
          url:urlToGetInfo,
          beforeSend: function(request) {
            request.setRequestHeader("Authorization", authorization);
          }
         }).done(function (data) {
          if (data.features.length > 0) {
            data.features.forEach(element => {
              /**
                             * https://developer.mozilla.org/pt-BR/docs/Web/JavaScript/Reference/Global_Objects/Object/entries
                             */
              if (Object.keys(element.properties).length > 0) {
                const tr = L.DomUtil.create('tr', 'table-active', tableBody)
                const td = L.DomUtil.create('td', '', tr)
                td.setAttribute('colspan', '3')
                const textTitle = L.DomUtil.create('b', '', td)
                textTitle.innerText = (element.id.split('.')[0]).toUpperCase()

                Object.entries(element.properties).forEach(([key, value]) => {
                  if (value != null) {
                    const tr = L.DomUtil.create('tr', '', tableBody)
                    const tdLeft = L.DomUtil.create('td', '', tr)
                    tdLeft.innerText = key

                    const tdRight = L.DomUtil.create('td', '', tr)
                    tdRight.setAttribute('colspan', '2')
                    tdRight.innerText = value
                  }
                })
              }
            })
            popupTemplate.append(table)
          }

          if (data.features.length < 0) {
            popupTemplate.append('<p>No data to show!</p>')
          }
        }).fail(function () {
          popupTemplate.append('<p>The server is not responding the request!</p>')
        }).always(function () {
          if (popupTemplate.getElementsByClassName(loading.className).length) {
            loading.remove()
          }
          popup.update()
        })
      })
    }

    map.on('popupopen', onOpen)

    const marker = L.marker(event.latlng, { icon: tbIcon }).bindPopup(popup)

    resultsGetFeatureInfo.addLayer(marker)

    marker.openPopup(event.latlng)
  }

  /**
     * treats the layers url to get feature info in JSON format
     *
     * @param {*} event
     */
  const getFeatureInfoUrlJson = function (event) {
    const point = map.latLngToContainerPoint(event.latlng, map.getZoom())
    const size = map.getSize()
    const bounds = map.getBounds()

    const result = []; const ctrlReplication = []
    map.eachLayer(layer => {
      const match = /gwc\/service/
      const hasReplication = function (lName) {
        ctrlReplication.some(function (l) {
          if (l === lName) {
            return true
          }
        })
        return false
      }

      if (layer.options.layers && !hasReplication(layer.options.layers)) {
        ctrlReplication.push(layer.options.layers)
        var defaultParams = {
          request: 'GetFeatureInfo',
          service: 'WMS',
          version: layer.wmsParams.version,
          bbox: bounds.toBBoxString(),
          height: size.y.toFixed(0),
          width: size.x.toFixed(0),
          layers: layer.wmsParams.layers,
          query_layers: layer.wmsParams.layers,
          typename: layer.wmsParams.layers
        }

        if(layer.wmsParams.time)
        {
          defaultParams.time=layer.wmsParams.time
        }

        var paramsOptions = {
          info_format: 'application/json'
        }

        var params = L.Util.extend(defaultParams, paramsOptions || {})

        params[params.version === '1.3.0' ? 'i' : 'x'] = point.x
        params[params.version === '1.3.0' ? 'j' : 'y'] = point.y

        const url = match.test(layer._url) === true
          ? layer._url.replace('gwc/service', layer.wmsParams.layers.split(':')[0]) : layer._url
        result.push(url + L.Util.getParamString(params, url, true))
      }
    })
    return result
  }

  const getBounds = function () 
  {
    return map.getBounds();
  }

  const getCRS = function () 
  {
    return map.options.crs;
  }

  

  /**
     * This method try to find the layer identified by name excluding the Layers with time dimension enabled.
     * If the layer you are looking for is a base layer, the workspace does not exist, so it should be tested.
     *
     * @param {*} layerName is the name of layer including the workspace ("workspace:layername")
     */
  const getLayerByName = function (layerName) {
    if (typeof (layerName) === 'undefined' || layerName === null) {
      // console.log("layerName must not be null!");
      // return this;
      return null
    }

    // remove the separator character if the workspace does not exist
    if (layerName.indexOf(':') == 0) {
      layerName=layerName.split(':')[1];
    }

    let layer = null
    map.eachLayer(l => {
      if(!layer) {
        if (l.options._baselayer && l.options._name === layerName) {
          layer = l
        }
        else if (l.options.layers && l.options.layers === layerName) {
          layer = l
        }
      }
    });

    return layer
  }

   /**
     * This method try to find the layer identified by id.
     *
     * @param {*} layerId layerId
     */
    const getLayerById = function (layerId) {
      if (typeof (layerId) === 'undefined' || layerId === null) {
         return null
      }
  
      let layer = null
      map.eachLayer(l => {
        if (l.options.id && l.options.id === layerId && !layer) {
          layer = l
        }
      })
  
      return layer
    }

  /**
     * This method ask to the map if the layer is visible
     *
     * @param {*} layer
     */
  const isLayerActived = function (layer) {
    if (typeof (layer) === 'undefined' || layer === null) {
      // console.log("layer must not be null!");
      return false
    }

    if(layer.workspace)
    {
      layerName=layer.workspace+':';
    }

    layerName += getLayerName(layer);

    const ll = getLayerByName(layerName)
    return ((ll) ? (map.hasLayer(ll)) : (false))
  }

  /**
     * This method remove layer from the map
     *
     * @param {*} layer
     */
  const deactiveLayer = function (layer) {
    if (!layer || !layer.name) {
      // console.log("layer must not be null!");
      return false
    }
    // if time dimension is enabled for this layer, remove it.

    let layerName="";

    if(layer.workspace)
    {
      layerName=layer.workspace+':';
    }

    layerName += getLayerName(layer);
    if (layerName === _ctrlTimer.layerName) {
      removeTimerControl()
    }
    const ll = getLayerByName(layerName)
    if (ll) {
      map.removeLayer(ll)
    }
  }

  /**
     * This method add one layer to the map.
     *
     * @param {*} layer The parameters to instantiate the Leaflet layer and add into map.
     */
  const activeLayer = function (layer) {
    if (typeof (layer) === 'undefined' || layer === null) {
      // console.log("layer must not be null!");
      return this
    }
    const layers = []
    layer.active = true
    layers.push(layer)

    layer.baselayer === true
      ? mountCustomizedBaseLayers(JSON.parse(JSON.stringify(layers)))
      : mountCustomizedOverLayers(JSON.parse(JSON.stringify(layers)))
  }

  /**
     * This method set the layer opacity
     *
     * @param {*} layer
     */
  const setOpacityToLayer = function (layer, value) {
    if (!layer || !value) {
      // console.log("layer must not be null!");
      return false
    }

    if(layer.workspace)
    {
      layerName=layer.workspace+':';
    }

    layerName += getLayerName(layer);

    const ll = getLayerByName(layerName)
    if (ll) ll.setOpacity(value)
  }

  /**
     * This method hide the standard layerControl from leaflet
     */
  const hideStandardLayerControl = function () {
    $('.leaflet-control-layers').hide()
    return this
  }

  /**
     * This method receives a layer and move to back from others layers
     */
  const moveLayerToFront = function (layer, value) {
    const layersOnMap = []
    const layers = Object.values(layerControl._map._layers)
    for (let index = 0; index < layers.length; index++) {
      const element = layers[index]
      if (element.options.hasOwnProperty('_baselayer')) {
        if (!element.options._baselayer) {
          layersOnMap.push(element)
        }
      }
    }
    // console.log(layersOnMap);


    if(layer.workspace)
    {
      layerName=layer.workspace+':';
    }

    layerName += getLayerName(layer);

    const ll = getLayerByName(layerName)
    const layerId = ll._leaflet_id
    for (let index = 0; index < layersOnMap.length; index++) {
      const element = layersOnMap[index]
      if (!(element._leaflet_id === layerId)) {
        if (ll.options.zIndex < element.options.zIndex) {
          // console.log("moveLayerToFront from [ " + ll.options._name + " ] to [ " + element.options._name + " ]");

          const elementZIndex = element.options.zIndex
          const layerZIndex = ll.options.zIndex

          ll.setZIndex(elementZIndex)
          ll.options.zIndex = elementZIndex

          element.setZIndex(layerZIndex)
          element.options.zIndex = layerZIndex

          break
        }
      }
    }
  }

  /**
     * This method receives a layer and move to from from others layers
     */
  const moveLayerToBack = function (layer, value) {
    const layersOnMap = []
    const layers = Object.values(layerControl._map._layers)
    for (let index = 0; index < layers.length; index++) {
      const element = layers[index]
      if (element.options.hasOwnProperty('_baselayer')) {
        if (!element.options._baselayer) {
          layersOnMap.push(element)
        }
      }
    }
    // console.log(layersOnMap);


    if(layer.workspace)
    {
      layerName=layer.workspace+':';
    }

    layerName += getLayerName(layer);

    const ll = getLayerByName(layerName)
    const layerId = ll._leaflet_id
    for (let index = 0; index < layersOnMap.length; index++) {
      const element = layersOnMap[index]
      if (!(element._leaflet_id === layerId)) {
        if (ll.options.zIndex > element.options.zIndex) {
          // console.log("moveLayerToBack [ " + ll.options._name + " ] to [ " + element.options._name + " ]");

          const elementZIndex = element.options.zIndex
          const layerZIndex = ll.options.zIndex

          ll.setZIndex(elementZIndex)
          ll.options.zIndex = elementZIndex

          element.setZIndex(layerZIndex)
          element.options.zIndex = layerZIndex

          break
        }
      }
    }
  }

  /**
     * This method iterate under layerControl layers and identify the overlayers
     */
  const getTerrabrasilisOverlayers = function () {
    const result = []

    map.eachLayer(layer => {
      // console.log(layer);
      // console.log(layer.options);
      if (layer.options.hasOwnProperty('_baselayer')) {
        if (!layer.options._baselayer) {
          result.push(layer)
        }
      }
    })

    return result
  }

  /**
     * This method iterate under layerControl layers and identify the baselayers
     */
  const getTerrabrasilisBaselayers = function () {
    const result = []

    map.eachLayer(layer => {
      if (layer.options._baselayer) {
        // console.log(layer);
        result.push(layer)
      }
    })

    return result
  }

  /**
     * This method receive the objet with information to add layer on the map dinamically
     *
     *  {
     *      geospatialHost:  'value',
     *      workspace:       'value',
     *      name:            'value',
     *      active:          'value',
     *  }
     *
     * @param {*} layerOptions
     */
  const addLayerByGetCapabilities = function (layerOptions, customized) {
    if (layerOptions === 'undefined' || layerOptions === null || layerOptions === '') {
      alert('No data to add layer on the map!')
      return
    }

    if (!customized) {
      const legend = L.control.htmllegend({
        position: 'bottomleft',
        collapseSimple: true,
        detectStretched: true,
        collapsedOnInit: true,
        defaultOpacity: 1.0,
        visibleIcon: 'icon icon-eye',
        hiddenIcon: 'icon icon-eye-slash'
      })

      const options = layerOptions

      // console.log(options);

      const layer = L.tileLayer.wms(options.geospatialHost, {
        layers: options.workspace + ':' + options.name,
        format: 'image/png',
        transparent: true
      })

      legendToShow.addLegend({
        name: options.name,
        layer: layer,
        opacity: 1.0,
        elements: [{
          label: options.name,
          html: '',
          style: {
            'background-color': '',
            width: '10px',
            height: '10px'
          }
        }]
      })

      var groupLayer = {
        groupName: 'BY GETCAPABILITIES'
      }

      // layerControl.addOverlay(layer, options.name);
      layerControl.addOverlay(layer, options.name, groupLayer)
      map.addLayer(layer)
    }

    if (customized) {
      const ol = layerOptions
      const options = {
        layers: ol.workspace + ':' + ol.name,
        format: 'image/png',
        transparent: true,
        _name: ol.name,
        _baselayer: ol.baselayer,
        _thirdlayer: true
      }
      var layer = L.tileLayer.wms(ol.geospatialHost, options)

      layerControl.addOverlay(layer, ol.name)
      map.addLayer(layer)
    }
  }

  /**
     * This method return the currently map
     */
  const getCurrentlyMap = function () {
    return map
  }

  /**
     * add GetLayerFeatureInfo event to map
     */
  const addGetLayerFeatureInfoEventToMap = function (event) {
    /**
         * work with the specific element actived
         */
    const element = event.target
    const hasClass = element.classList.contains('md-off')
    if (hasClass) {
      /**
             * disable the coordinates tool
             */
      $('.to-manipulate').each(function (idx) {
        const element = this
        element.classList.remove('md-on')
        element.classList.add('md-off')
      })
      map.off('click', showCoordinates)
      $('#map').css('cursor', '')

      /**
             * enable the feature info tool
             */
      element.classList.remove('md-off')
      element.classList.add('md-on')
      $('#map').addClass('cursor-feature-info') // this class was located in: style.css file
      map.on('click', getLayerFeatureInfo)
    } else {
      $('.to-manipulate').each(function (idx) {
        const element = this
        element.classList.remove('md-on')
        element.classList.add('md-off')
      })
      $('#map').removeClass('cursor-feature-info')
      $('#map').css('cursor', '')

      map.off('click', getLayerFeatureInfo)
      resultsGetFeatureInfo.clearLayers()
    };
  }

  /**
     * add ShowCoordinates event to map
     */
  const addShowCoordinatesEventToMap = function (event) {
    /**
         * work with the specific element actived
         */
    const element = event.target
    const hasClass = element.classList.contains('md-off')
    if (hasClass) {
      /**
             * disable the coordinates tool
             */
      $('.to-manipulate').each(function (idx) {
        const element = this
        element.classList.remove('md-on')
        element.classList.add('md-off')
      })
      resultsGetFeatureInfo.clearLayers()
      map.off('click', getLayerFeatureInfo)
      $('#map').css('cursor', '')

      /**
             * enable the coordinates tool
             */
      element.classList.remove('md-off')
      element.classList.add('md-on')
      $('#map').css('cursor', 'crosshair')
      map.on('click', showCoordinates)
    } else {
      $('.to-manipulate').each(function (idx) {
        const element = this
        element.classList.remove('md-on')
        element.classList.add('md-off')
      })
      $('#map').css('cursor', '')

      map.off('click', showCoordinates)
      resultsGetFeatureInfo.clearLayers()
    };
  }

  /* Start of the Time Dimension support methods. */

  /**
     * Enable or disable the TimeDimension layer for a WMS layer.
     * Optionally, you may use the option to aggregate times when walking through the timeline of a Layer.
     *
     * @param {string} layerName The name of one layer that is already added in to map. Compose by "workspace:layername"
     * @param {boolean} aggregateTimes The control parameter to set the time aggregate option. Default is false.
     */
  const onOffTimeDimension = function (layerName, aggregateTimes = false) {
    if (layerName.indexOf(':') > 0) {
      const isNewLayer = _ctrlTimer.layerName !== layerName;
      removeTimerControl();
      if (isNewLayer) addTimerControl(layerName, aggregateTimes);
    }else{
      console.error("Fail to enable the TimeDimension tool. The workspace is missing to clearly identify the layer ("+layerName+").");
      throw ApiException("Missing workspace");
    }
  }

  /**
     * Removes the Leaflet TimeDimension control from the map.
     * Uses the general reference of the last active control only if the _ctrlTimer.layerName it is into the Time Dimension layer list.
     */
  const removeTimerControl = function () {
    if (_ctrlTimer.control) {
      var l = getTimeLayer(_ctrlTimer.layerName)
      if (l) {
        // remove both control and layer TimeDimension from map.
        _ctrlTimer.control.remove(map)
        _ctrlTimer.timeDimensionLayer.removeFrom(map)

        // restore Leaflet Layer to map
        _ctrlTimer.leafletLayer.options.time = null
        _ctrlTimer.leafletLayer._visible = true
        _ctrlTimer.leafletLayer.addTo(map)

        // clear all referencies
        _ctrlTimer.control = null
        _ctrlTimer.timeDimensionLayer = null
        _ctrlTimer.layerName = null
        _ctrlTimer.leafletLayer = null
        _ctrlTimer.timeDimension = null
      }
    }
  }

    /**
     * Removes all Leaflet TimeDimension control from the map.
     */
    const removeAllTimerControl = function () {
      if (_ctrlTimer.control) {
          // remove both control and layer TimeDimension from map.
          _ctrlTimer.control.remove(map)
          if(_ctrlTimer.timeDimensionLayer)
          {
            _ctrlTimer.timeDimensionLayer.removeFrom(map)
          }
            
          if(_ctrlTimer.leafletLayer)
          {
            // restore Leaflet Layer to map
            _ctrlTimer.leafletLayer.options.time = null
            _ctrlTimer.leafletLayer._visible = true
            _ctrlTimer.leafletLayer.addTo(map)

          }
  
          // clear all referencies
          _ctrlTimer.control = null
          _ctrlTimer.timeDimensionLayer = null
          _ctrlTimer.layerName = null
          _ctrlTimer.leafletLayer = null
          _ctrlTimer.timeDimension = null
      }
    }

  /**
     * Add the Time Dimension control into the map for one specific layer.
     * Optionally, you may use the option to aggregate times when walking through the timeline of a Layer.
     *
     * @param {string} layerName The layer name to enable the Time Dimension tool over the map. Compose by "workspace:layername"
     * @param {boolen} aggregateTimes The control parameter to set the time aggregate option.
     */
  const addTimerControl = function (layerName, aggregateTimes) {
    if (!_ctrlTimer.timeDimension) {
      const tdOptions = {
        aggregateTimes: aggregateTimes
      }
      _ctrlTimer.timeDimension = new L.TimeDimension(tdOptions)
    }

    var options = {
      timeDimension: _ctrlTimer.timeDimension,
      limitSliders: false,
      formatDate: {
        formatMatcher: { year: 'numeric', month: 'numeric', day: 'numeric' },
        locale: 'pt-BR'
      }
    }

    _ctrlTimer.control = L.control.timeDimension(options).addTo(map);
    _ctrlTimer.layerName = layerName;
    let workspace=layerName.split(":")[0];
    let name=layerName.split(":")[1];
    if (addLayerTimeDimension(workspace,name)) {
      console.log('Enable TimeDimension support to the ' + layerName + ' Layer.')
      return true
    } else {
      console.log('Failure TimeDimension support to the ' + layerName + ' Layer.')
      removeTimerControl()
      return false
    }
  }

  /**
     * Used to create the TimeDimension Layer that encapsulate the Default WMS Leaflet Layer.
     * @param {JSON} layerConfig The JSON layer config from external app.
     */
  const createTimeDimensionLayerFromConfig = function (layerConfig) 
  {
    let url = getLayerBaseURL(layerConfig);
    
    var layerName = getLayerName(layerConfig);
    var tdOptions = {
      timeDimension: _ctrlTimer.timeDimension,
      requestTimeFromCapabilities: true,
      getCapabilitiesUrl: null,
      setDefaultTime: true,
      getCapabilitiesLayerName: layerConfig.name,
      wmsVersion: '1.3.0',
      proxy: null,
      getCapabilitiesParams: {}
    }
   
    const ll = getLayerByName(layerConfig.workspace+':'+layerName);
    
    var timeDimensionLayer = L.timeDimension.layer.wms(ll, tdOptions);

    return timeDimensionLayer;
  }
  const getLayerBaseURL = function (layer) 
  {
    //Fill with workspace on URL
    let url = layer.datasource.host;
    if(layer.datasource.host.includes(layer.workspace))
    {
      url = url.replace(layer.workspace+"/", "");
    }    
    if(layer.datasource.host.includes(layer.name))
    {      
      url = url.replace(layer.name+"/", "");
    }
    else
    {
      url = url.replace('ows', layer.workspace + '/' + layer.name + '/ows');
      return url;
    }

  }

  /**
     * Create TimeDimension Layer if it not exists and add it to map.
     * Before add TimeDimension to map, removes the default Leaflef Layer from the map.
     *
     * @param {string} layerName, the layer name with workspace
     */
  const addLayerTimeDimension = function (workspace,layerName) {
    var hasTimeLayer = getTimeLayer(workspace+':'+layerName)

    if (hasTimeLayer && isLayerActived({ name: layerName, workspace: workspace })) {
      if (!_ctrlTimer.timeDimensionLayer) {
        _ctrlTimer.timeDimensionLayer = createTimeDimensionLayerFromConfig(hasTimeLayer)
      }


      _ctrlTimer.leafletLayer = getLayerByName(workspace+':'+layerName)

      // Removing the default Leaflet Layer from the map.
      map.removeLayer(_ctrlTimer.leafletLayer)

      // Adding TimeDimension Layer to the map.
      _ctrlTimer.timeDimensionLayer.addTo(map)

      // Removing the default Leaflet Layer from the map.
      map.removeLayer(_ctrlTimer.leafletLayer)
    }

    return hasTimeLayer
  }

  const getTimeLayer = function (layerName) {
    if (layerName) {
      workspace = layerName.split(':')[0];
      layerName = layerName.split(':')[1];

      for (const key in _timeConfigLayers) {
        if (_timeConfigLayers.hasOwnProperty(key)) {
          const layer = _timeConfigLayers[key]

          var name = getLayerName(layer);
          
          if (name === layerName) 
          {
            return layer
          }
        }
      }
    }
    return null
  }

  /* The end of the Time Dimension support methods. */

  const resizeMap = function () {
    map.invalidateSize()
  }

  const checkMap = function () {
    return !(map === undefined || map === null)
  }

  const removeMap = function () {
    map.remove()
  }

  /**
     * Enable loading to body
     */
  const enableLoading = function (dom) {
    console.log('Enable loading')

    if (typeof (dom) === 'undefined' || dom === null) dom = 'body'

    $(dom).loading()
  }

  /**
     * Disable loading to body
     */
  const disableLoading = function (dom) {
    if (typeof (dom) === 'undefined' || dom === null) dom = 'body'

    $(dom).loading('stop')
  }

  const fitBounds = function (layerMetada) {
    return new Promise((resolve, reject) => {
      utils.getBounds(layerMetada)
        .then((bounds) => {
          map.fitBounds(bounds)
          resolve()
        })
        .catch(reject)
    })
  }

  const getDimensions = function (layerMetada) {
    return utils.getDimensions(layerMetada)
  }

  /**
   * Parames inside filter are the same as the layer-filter-reducer interface
   * 
   * @param {name} string the name of the layer
   * @param {time} string: time format should be DATE_1/DATE_2
   *          Acceptale values could be: YYYY/YYYY or YYYY-MM/YYYY-MM or YYYY-MM-DD YYYY-MM-DD
   *          valid examples: 2017/2017 2017-01/2017-02 2017-06-31/2017-06-31  
   */
  const filterLayers = function (filters) {
    filters.map(({layerName, workspace, time}) => {
      let completeLayerName = workspace + ":" + layerName;
      const layer = getLayerByName(completeLayerName);
      if(!layer) return
      layer.setParams({ time });
      layer.redraw();
    })
    this.stateChangedCallback();
  }
/**
 * This method can be invoked to updateLayer values syncronizing appLayers to leafletLayers.
 * @param {*} appLayers List of app layers in JSON format
 */
  const updateLayers = function(appLayers)
  {
    for (const key in appLayers) {
      if (appLayers.hasOwnProperty(key)) {
        const appLayer = appLayers[key]
        var leafLetLayer = getLayerById(appLayer.id);
        if(leafLetLayer!=null)
        {
          var userAuthenticated = AuthenticationService.isAuthenticated();
          switchToAuthenticatedLayer(leafLetLayer, appLayer, userAuthenticated);
        }

      }
    }
  }
  /**
   * This method updates the layer name when user login or logout. This is invoked by a Authentication Oauth Api event.
   * If the user is authenticated and if the user has a value on "nameAuthenticated" field, the source layer on leaflet will be changed.
   *   @param {*} leafletLayer Referenced leaflet layer
   *   @param {*} appLayer Referenced app layer
   *   @param {*} authenticated If user is authenticated or not
   */
  const switchToAuthenticatedLayer = function(leafLetLayer, appLayer, authenticated)
  {
    if(appLayer.nameAuthenticated && appLayer.nameAuthenticated.length>0)
    {

      if(appLayer.active)
      {
        map.removeLayer(leafLetLayer);
      }
            
      //Updating Layer Options
      if(authenticated==true)
      {
        leafLetLayer.options.layers = appLayer.workspace + ":" + appLayer.nameAuthenticated;
        leafLetLayer.options._name = appLayer.nameAuthenticated;
        if(appLayer.datasource.authenticationProxyUrl)
        {
          leafLetLayer._url = appLayer.datasource.authenticationProxyUrl + appLayer.datasource.host;
          leafLetLayer.headers = [
            {
              header: "Authorization",
              value: "Bearer " + AuthenticationService.getToken()
            }
          ]
        }        
      }
      else
      {
        leafLetLayer.options.layers = appLayer.workspace + ":" + appLayer.name;
        leafLetLayer.options._name = appLayer.name;
        leafLetLayer._url = appLayer.datasource.host;                
        leafLetLayer.headers=[];
      }
      //Updating LeafLet wmsParams
      leafLetLayer.wmsParams.layers = leafLetLayer.options.layers; 
      leafLetLayer.wmsParams._name = leafLetLayer.options._name;

      if(appLayer.active)
      {
        map.addLayer(leafLetLayer);
      }
      
    }
   }

   var fetchImage = async function(url, callback, headers, abort) {
    let _headers = {};
    if (headers) {
      headers.forEach(h => {
        _headers[h.header] = h.value;
      });
    }
    signal = null
    if(abort)
    {
      const controller = new AbortController();
      signal = controller.signal;
      if (abort) {
        abort.subscribe(() => {
          controller.abort();
        });
      }
    }
    
    TilesWorkerPool.addJob(fetchImageJob, callback, [url, _headers, abort]);

  }

  var fetchImageJob = async function(url, headers, signal) {   

    console.debug(headers);

    const f = await fetch(url, {
      method: "GET",
      headers: headers,
      mode: "cors",
      signal: signal
    });
    
    const blob = await f.blob();
    return blob;
  }

   const configureWMSHeaderLayerType = function()
   {

    
    L.TileLayer.WMSHeader = L.TileLayer.WMS.extend({
      initialize: function (url, options, headers, abort, results) {
        L.TileLayer.WMS.prototype.initialize.call(this, url, options);
        this.headers = headers;
        //this.abort = abort;
        this.results = results;
      },
      createTile(coords, done) {
        const url = this.getTileUrl(coords);
        const img = document.createElement("img");
        img.setAttribute("role", "presentation");
        let h = this.headers;
        let a = this.abort;
        self = this;
    
        fetchImage(
          url,
          function(status,resp) {
            if(status && resp && resp.type=="image/png")
            {
              const reader = new FileReader();
              reader.onload = () => {
                img.src = reader.result;
                if (self.results) {
                  self.results.next(reader.result);
                };
              };
              reader.readAsDataURL(resp);
              done(null, img);
            }
            else
            {
              console.error(resp);
            }           
          },
          h,
          a
        );
        return img;
      }
    });
    
    L.wmsHeader = function (url, options, headers, abort, results) {
      return new L.TileLayer.WMSHeader(url, options, headers, abort, results);
    };
    return this;
   }


   /*
 * L.SingleTile uses L.ImageOverlay to display a single-tile WMS layer.
 * url parameter must accept WMS-style width, height and bbox.
 */

L.SingleTile = L.ImageOverlay.extend({
	defaultWmsParams: {
		service: 'WMS',
		request: 'GetMap',
		version: '1.1.1',
		layers: '',
		styles: '',
		format: 'image/png',
		transparent: true
	},
  _visible: true,
  _loaded: false,

  // _originalUpdate: L.NonTiledLayer.prototype._update,
  // _originalOnRemove: L.NonTiledLayer.prototype.onRemove,

	initialize: function( url, options, headers, abort, results) 
  {
		this.wmsParams = L.extend({      
    }, this.defaultWmsParams);
    this.wmsParams.layers=options.wmsParams.layers;
    this.wmsParams.format=options.wmsParams.format;
    this.wmsParams.time=options.wmsParams.time;
    this.headers = headers;
    //this.abort = abort;
    this.results = results;

    //console.log("Initializating layer: " + options.wmsParams.time);
		L.ImageOverlay.prototype.initialize.call(this, url, null, options);
	},

	setParams: function (params) {
		L.extend(this.wmsParams, params);
		return this;
	},

	redraw: function () {
		this._updateImageUrl();
	},

	onAdd: function (map) 
  {
    this._map = map;
		var projectionKey = parseFloat(this.wmsParams.version) >= 1.3 ? 'crs' : 'srs';
//		this.wmsParams[projectionKey] = 'EPSG:4326'; // this is incorrect!
		this.wmsParams[projectionKey] = map.options.crs.code;
		L.ImageOverlay.prototype.onAdd.call(this, map);
    
		map.on('moveend', this._updateImageUrl, this);
	},

	onRemove: function (map) {
		map.on('moveend', this._updateImageUrl, this);
		L.ImageOverlay.prototype.onRemove.call(this, map);
	},

	// Copypasted from L.ImageOverlay (dirty hack)
	_initImage: function () {
		this._image = L.DomUtil.create('img', 'leaflet-image-layer');

		if (this._map.options.zoomAnimation && L.Browser.any3d) {
			L.DomUtil.addClass(this._image, 'leaflet-zoom-animated');
		} else {
			L.DomUtil.addClass(this._image, 'leaflet-zoom-hide');
		}

		this._updateOpacity();
		this._bounds = this._map.getBounds();

		//TODO createImage util method to remove duplication
		L.extend(this._image, {
			galleryimg: 'no',
			onselectstart: L.Util.falseFn,
			onmousemove: L.Util.falseFn,
			onload: L.bind(this._onImageLoad, this),
			src: ""
		});
    
    this._updateImage();

	},

	_onImageLoad: function () 
  {
    if(this._map)
    {
      this._bounds = this._map.getBounds();
    
      this._reset();      
    } 
    this.fire('load');
	},

  _updateImage: function ()
  {

    let url = this._constructUrl();
    let img = this._image;
    let h = this.headers;
    let a = this.abort;
    fetchImage(
      url,
      function(status,resp) {
        if(status && resp && resp.type=="image/png")
        {
          const reader = new FileReader();
          reader.onload = () => {
            img.src = reader.result;
            if (self.results) {
              self.results.next(reader.result);
            };
          };
          reader.readAsDataURL(resp);
          //done(null, this._image);
        }
        else
        {
          console.error(resp);
        }           
      },
      h,
      a
    );
  },

	_updateImageUrl: function () 
  {
    // if(this._map)
    // {
    //   this._image.src = this._constructUrl();
    // }
    this._updateImage();
		
	},

	_constructUrl: function () 
  {    
		var size = this._map.getSize();
		var b = this._map.getBounds();
    var crs = this._map.options.crs;
    var ne = crs.project(b.getNorthEast());
    var sw = crs.project(b.getSouthWest());
    var bbox = new L.LatLngBounds(new L.LatLng(sw.y, sw.x), new L.LatLng(ne.y, ne.x))
    

		return this._url + L.Util.getParamString(this.wmsParams, this._url) + "&width=" + size.x + "&height=" + size.y + "&bbox=" + bbox.toBBoxString();
	},


  setLoaded: function(loaded) {
    this._loaded = loaded;
},

isLoaded: function() {
    return this._loaded;
},
hide: function() {
  this._visible = false;
  if(this._image)
  {
    this._image.style.display = 'none';
  }  
},

show: function() {
  this._visible = true;
  if(this._image)
  {    
    this._image.style.display = 'block';
  }
},
});

L.singleTile = function (url, options, headers, abort, results) {
	return new L.SingleTile(url, options, headers, abort, results);
};



  /// ////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // return
  /// ////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  /**
     * That return allow the client of this object invoke some method like: Terrabrasilis.mountMap()
     */
  return {

    /**
         * mount map and enable tools, these methods use the fluent interface concepts
         */
    map: mountMap,
    filterLayers: filterLayers,
    addBaseLayers: mountBaseLayers,
    addOverLayers: mountOverLayers,
    addCustomizedBaseLayers: mountCustomizedBaseLayers,
    addCustomizedOverLayers: mountCustomizedOverLayers,
    reorderOverLayers: reorderOverLayers,
    addGeoJsonLayers: mountGeoJsonLayers,
    enableDrawFeatureTool: enableDrawnFeature,
    disableDrawFeatureTool: disableDrawFeatureTool,
    enableLayersControlTool: enableLayersControl,
    enableScaleControlTool: enableScaleControl,
    enableGeocodingTool: enableGeocodingControl,
    enableLegendAndToolToLayers: enableLegendAndToolToLayers,
    enableZoomBox: enableZoomBox,
    hideStandardLayerControl: hideStandardLayerControl,
    enableInvalidateSize: resizeMap,
    disableMap: removeMap,
    hasDefinedMap: checkMap,
    setLegend: setGradesLegend,
    getLegend: getGradesLegend,
    setColor: setColorLegend,
    getColor: getColorLegend,
    enableDisplayMouseCoordinates: enableDisplayMouseCoordinates,
    configureWMSHeaderLayerType: configureWMSHeaderLayerType,

    /**
         * general tools
         */
    resetMap: resetMapToInitialView,
    fullScreen: goToFullscreen,
    undo: undo,
    redo: redo,
    getCurrentlyMap: getCurrentlyMap,
    addLayerByGetCapabilities: addLayerByGetCapabilities,
    getTerrabrasilisOverlayers: getTerrabrasilisOverlayers,
    getTerrabrasilisBaselayers: getTerrabrasilisBaselayers,
    getLayerByName: getLayerByName,
    isLayerActived: isLayerActived,
    deactiveLayer: deactiveLayer,
    activeLayer: activeLayer,
    setOpacityToLayer: setOpacityToLayer,
    moveLayerToBack: moveLayerToBack,
    moveLayerToFront: moveLayerToFront,
    addGetLayerFeatureInfoEventToMap: addGetLayerFeatureInfoEventToMap,
    addShowCoordinatesEventToMap: addShowCoordinatesEventToMap,
    enableLoading: enableLoading,
    disableLoading: disableLoading,
    fitBounds: fitBounds,
    getBounds: getBounds,
    getCRS: getCRS,
    getDimensions: getDimensions,
    updateLayers: updateLayers,
    removeAllTimerControl: removeAllTimerControl,

    /* TimeDimension tool */
    onOffTimeDimension: onOffTimeDimension
  }
})(Terrabrasilis || {})

module.exports = Terrabrasilis
