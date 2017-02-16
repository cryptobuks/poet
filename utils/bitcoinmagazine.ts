import * as fs from 'fs'

import * as fetch from 'isomorphic-fetch'
import * as moment from 'moment'
import * as xml2js from 'xml2js'

import { getBuilder } from './poetlib/serialization/builder'
import * as common from './poetlib/common'

declare var require: any

const bitcore = require('bitcore-lib')

const targetURL = 'https://bitcoinmagazine.com/feed/'
const explorerURL = 'http://localhost:10000/api/explorer'
const publisherURL = 'http://localhost:10000/api/user'

const rawKey = '4cbfeb0cbfa891148988a50b549c42309e088a7839dd14ab480f542286725d3a'

const btcmediaPrivkey = bitcore.PrivateKey(rawKey)
const btcmediaPubkey = btcmediaPrivkey.publicKey.toString()

interface Article {
  id: string
  link: string
  content: string
  author: string
  tags: string
  displayName: string
  publicationDate: string
}

function getContent(article: any): string {
  const builder = new xml2js.Builder({ rootName: 'article' })
  return builder.buildObject(article.content[0])
}

function getAuthor(article: any): string {
  return article.author.length > 1 ? article.author.join(', ') : article.author[0]
}

function getTags(article: any): string {
  return article.category.join(',')
}

function getTitle(article: any): string {
  return article.title[0]
}

function getPublicationDate(article: any): string {
  return '' + moment(article.pubDate[0]).toDate().getTime()
}

function getId(article: any): string {
  return article.guid[0]
}

function getLink(article: any): string {
  return article.link[0]
}

function processItem(article: any): Article {
  return {
    id: getId(article),
    link: getLink(article),
    content: getContent(article),
    author: getAuthor(article),
    tags: getTags(article),
    displayName: getTitle(article),
    publicationDate: getPublicationDate(article)
  }
}

async function process(xmlResponse: any): Promise<Article[]> {
  const items = await new Promise(function(resolve, reject) {
    xmlResponse.text().then((body: any) =>
      xml2js.parseString(body, function(err, res) {
        if (err) {
          return reject(err)
        }
        return resolve(res.rss.channel[0].item)
      })
    )
  })
  return (items as any[]).map(processItem)
}

async function scanBTCMagazine(): Promise<any> {
  fetch(targetURL).then(process).then(async (results) => {
    const newArticles = []
    for (let article of results) {
      if (!(await exists(article))) {
        newArticles.push(article)
      }
    }
    await submitArticles(newArticles)
  })
}

function exists(article: Article): Promise<boolean> {
  return fetch(`${explorerURL}/works?attribute=id<>${article.id}&owner=${btcmediaPubkey}`)
    .then(res => res.json())
    .then(res => (res as any).length !== 0)
}

async function submitArticles(articles: Article[]) {
  const builder = await getBuilder()
  const signedClaims = articles.map(article => {
    const data = {
      type: 'Work',
      attributes: article
    }
    const message = builder.getEncodedForSigning(data, btcmediaPrivkey)
    const id = builder.getId(data, btcmediaPrivkey)
    const signature = common.sign(btcmediaPrivkey, id)
    return {
      message: new Buffer(new Buffer(message).toString('hex')).toString('hex'),
      signature: new Buffer(signature).toString('hex')
    }
  })
  return await postClaims(signedClaims)
}

async function postClaims(claims: any) {
  return fetch(`${publisherURL}/claims`, {
    method: 'POST',
    headers: {
      'content-type': 'text/plain'
    },
    body: JSON.stringify({ signatures: claims })
  }).then(body => {
    return body.text()
  }).then(body => {
    console.log(body.substr(0, 100) + '...')
  })
}

async function postProfile() {
  const profile = {
    displayName: "BTCMedia",
    firstName: "BTC",
    imageData: fs.readFileSync('./avatar.urlimage').toString(),
    lastName: "Media"
  }
  const data = {
    type: 'Profile',
    attributes: profile
  }
  const builder = await getBuilder()
  const message = builder.getEncodedForSigning(data, btcmediaPrivkey)
  const id = builder.getId(data, btcmediaPrivkey)
  const signature = common.sign(btcmediaPrivkey, id)
  return await postClaims([{
    message: new Buffer(new Buffer(message).toString('hex')).toString('hex'),
    signature: new Buffer(signature).toString('hex')
  }])
}

postProfile()

scanBTCMagazine()