const { get, find } = require('lodash')
const axios = require('axios')
const {xmlToJson} = require('./xmlToJson')

const Utils = {
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
  getBounds: (layerConfig) => {
    return new Promise((resolve, reject) => {
      const url = Utils.configureUrlWorkspace(layerConfig)
      axios.get(url).then((xmlResult) => {
        const jsonResult = Utils.parseXML(xmlResult.data)
        const layer = get(jsonResult, 'WMS_Capabilities.Capability.Layer', [])
        resolve(Utils.splitBounds(layer))
      })
    })
  },

  splitBounds(layer) {
    const bounds = get(layer, 'EX_GeographicBoundingBox', [])
    if (bounds) {
      return [
        [bounds.southBoundLatitude, bounds.westBoundLongitude],
        [bounds.northBoundLatitude, bounds.eastBoundLongitude]
      ]
    }
  },

  configureUrlWorkspace: (layerConfig) => {
    let baseUrl = layerConfig.datasource.host.replace('ows', layerConfig.workspace + '/' + layerConfig.name + '/ows')
    baseUrl += `REQUEST=GetCapabilities&VERSION=1.3.0&SERVICE=wms` 
    return baseUrl
  },

  parseXML: (xmlString) => {
    const xmlNode = new DOMParser().parseFromString(xmlString, 'text/xml')
    const result = xmlToJson(xmlNode)
    return result
  }
}

module.exports = Utils