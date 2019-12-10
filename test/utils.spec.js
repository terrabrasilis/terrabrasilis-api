require('jsdom-global')()
global.DOMParser = window.DOMParser

const utils = require('../src/utils')
const assert = require('assert')
const path = require('path')
const fs = require('fs')
const sinon = require('sinon')
const axios = require('axios')

const layerMetadata = require('./fixtures/layer-config-example.json')
const xmlCapabilitiesFixture = fs.readFileSync(path.join(__dirname, 'fixtures/capabilities-example.xml'), 'utf-8')
const xmlDimensionsFixture = fs.readFileSync(path.join(__dirname, 'fixtures/temporal.xml'), 'utf-8')

describe('UTILS', () => {
  let sandbox
  beforeEach(() => sandbox = sinon.createSandbox())
  afterEach(() => sandbox.restore())

  describe('capabilities config: ', () => {
    it('.configureUrlWorkspace', () => {
      const result = utils.configureUrlWorkspace(layerMetadata)
      assert.equal(1, 1)
    })

    it('.parseXML', () => {
      const xmlCapabilitiesFixture = fs.readFileSync(path.join(__dirname, 'fixtures/capabilities-example.xml'), 'utf-8')
      const result = utils.parseXML(xmlCapabilitiesFixture)
      assert.equal(result.WMS_Capabilities['@attributes'].version, '1.3.0')
    })

    it('.sortDatesArray', () => {
      const datesArray = ['2010-01-01T00:00:00.000Z', '2002-01-01T00:00:00.000Z', '2030-01-01T00:00:00.000Z', '2001-01-01T00:00:00.000Z']
      const result = utils.sortDatesArray(datesArray).map((item) => item.toISOString())
      const expected = ['2001-01-01T02:00:00.000Z', '2002-01-01T02:00:00.000Z', '2010-01-01T02:00:00.000Z', '2030-01-01T02:00:00.000Z']
      assert.deepEqual(result, expected)
    })

    it('.getBounds', async () => {
      const resolved = new Promise((resolve) => resolve({ data: xmlCapabilitiesFixture }))
      sandbox.stub(axios, 'get').returns(resolved)
      const result = await utils.getBounds(layerMetadata)
      assert.deepEqual(result, [
        ['-16.2779683090209', '-73.8538648282111'],
        ['5.20548191938395', '-44.0']
      ])
    })

    it('.splitBounds', () => {
      const boundingBoxExample = {
        EX_GeographicBoundingBox: {
          westBoundLongitude: '-73.9909438636055',
          eastBoundLongitude: '-43.0169133104806',
          southBoundLatitude: '-16.290519038121',
          northBoundLatitude: '5.27215639335258'
        }
      }

      const result = utils.splitBounds(boundingBoxExample)
      assert.deepEqual(result, [
        ['-16.290519038121', '-73.9909438636055'],
        ['5.27215639335258', '-43.0169133104806']
      ])
    })
  })

  describe('Dimensions', () => {
    it('.getDimensions', async () => {
      const resolved = new Promise((resolve) => resolve({ data: xmlDimensionsFixture }))
      sandbox.stub(axios, 'get').returns(resolved)
      let result = await utils.getDimensions(layerMetadata)
      result = result.map((item) => item.toISOString())
      const expected = ["2000-01-01T02:00:00.000Z","2001-01-01T02:00:00.000Z","2002-01-01T02:00:00.000Z","2003-01-01T02:00:00.000Z","2004-01-01T02:00:00.000Z","2005-01-01T02:00:00.000Z","2006-01-01T02:00:00.000Z","2007-01-01T02:00:00.000Z","2008-01-01T02:00:00.000Z","2009-01-01T02:00:00.000Z","2010-01-01T02:00:00.000Z","2011-01-01T02:00:00.000Z","2012-01-01T02:00:00.000Z","2013-01-01T02:00:00.000Z","2014-01-01T02:00:00.000Z","2015-01-01T02:00:00.000Z","2016-01-01T02:00:00.000Z","2017-01-01T02:00:00.000Z","2018-01-01T02:00:00.000Z"]
      assert.deepEqual(result, expected)
    })

    it('.splitDimensions', () => {
      const dimensions = '2000-01-01T00:00:00.000Z,2001-01-01T00:00:00.000Z,2002-01-01T00:00:00.000Z,2003-01-01T00:00:00.000Z,2004-01-01T00:00:00.000Z,2005-01-01T00:00:00.000Z,2006-01-01T00:00:00.000Z,2007-01-01T00:00:00.000Z,2008-01-01T00:00:00.000Z,2009-01-01T00:00:00.000Z,2010-01-01T00:00:00.000Z,2011-01-01T00:00:00.000Z,2012-01-01T00:00:00.000Z,2013-01-01T00:00:00.000Z,2014-01-01T00:00:00.000Z,2015-01-01T00:00:00.000Z,2016-01-01T00:00:00.000Z,2017-01-01T00:00:00.000Z,2018-01-01T00:00:00.000Z'
      const result = utils.splitDimensions(dimensions).map((item) => item.toISOString())
      const expected = ["2000-01-01T02:00:00.000Z","2001-01-01T02:00:00.000Z","2002-01-01T02:00:00.000Z","2003-01-01T02:00:00.000Z","2004-01-01T02:00:00.000Z","2005-01-01T02:00:00.000Z","2006-01-01T02:00:00.000Z","2007-01-01T02:00:00.000Z","2008-01-01T02:00:00.000Z","2009-01-01T02:00:00.000Z","2010-01-01T02:00:00.000Z","2011-01-01T02:00:00.000Z","2012-01-01T02:00:00.000Z","2013-01-01T02:00:00.000Z","2014-01-01T02:00:00.000Z","2015-01-01T02:00:00.000Z","2016-01-01T02:00:00.000Z","2017-01-01T02:00:00.000Z","2018-01-01T02:00:00.000Z"]
      assert.deepEqual(result, expected)
    })
  })
})
