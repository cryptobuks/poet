import * as Koa from 'koa'
import { sha256, verify } from '../common'

const bitcore = require('bitcore-lib')
const uuid = require('uuid')
const Body = require('koa-body')
const Route = require('koa-route')
const IO = require('koa-socket')

interface AuthServerOptons {
  port: number
}

interface SignedMessage {
  encodedHash: string
  timestamp: number
  accept: boolean
  extra: string
}

interface Signature {
  signature: string
  publicKey: string
  message: string
}

export default async function createServer(options: AuthServerOptons) {

  /**
   * We store a mapping from request id to websocket owning the request
   */
  const mappingToWebsocket = {} as any

  /**
   * Contains information about the request to sign, addressed by uuid
   */
  const requests = {} as any

  function makeRequest(id: string, payload: any, multiple: boolean) {
    const signRequest = {
      id,
      multiple,
      url: `http://localhost:5000/info/${id}`,
      message: payload,
      timestamp: new Date().getTime()
    }
    const encoded = JSON.stringify(signRequest)
    return encoded
  }

  function makeCreateResponse(payload: string, ref: string) {
    return JSON.stringify({
      status: "created",
      encoded: payload,
      ref
    })
  }

  function handleMultiple(websocket: any, messages: any) {

    const id = uuid.v4()
    const request = makeRequest(id, messages.payload, true)
    const ref: string = messages.ref || ''

    requests[id] = request
    mappingToWebsocket[id] = websocket

    websocket.emit('message', makeCreateResponse(request, ref))
  }

  function handleAssociate(websocket: any, message: any) {
    const id = message.id
    mappingToWebsocket[id] = websocket
    return
  }

  function handleMessage(websocket: any, message: any) {
    if (message.type !== 'create') {
      websocket.emit('message', `{"error": "Unknown type of message ${message.type}"}`)
      return
    }

    if (!message.payload) {
      websocket.emit('message', `{"error": "Need a payload"}`)
      return
    }

    const id = uuid.v4()
    const request = makeRequest(id, message.payload, false)
    const ref: string = message.ref || ''

    requests[id] = request
    mappingToWebsocket[id] = websocket

    websocket.emit('message', makeCreateResponse(request, ref))
  }

  function validSignatures(id: string, payload: Signature[]): boolean {
    for (var index in payload) {
      const encoded = new Buffer(JSON.parse(requests[id]).message[index], 'hex')
      const signature = payload[index].signature
      const publicKey = payload[index].publicKey
      console.log(encoded, signature, publicKey
                 )

      if (!encoded || !signature || !publicKey) {
        return false
      }

      if (!verify(
          new bitcore.PublicKey(publicKey),
          new Buffer(signature, 'hex'),
          sha256(encoded)))
      {
        console.log('Signature is invalid')
        return false
      }
    }

    return true
  }

  function validSignature(id: string, payload: Signature): boolean {
    const encoded = new Buffer(JSON.parse(requests[id]).message, 'hex')
    const signature = payload.signature
    const publicKey = payload.publicKey

    if (!encoded || !signature || !publicKey) {
      return false
    }

    if (!verify(
        new bitcore.PublicKey(publicKey),
        new Buffer(signature, 'hex'),
        sha256(encoded)))
    {
      console.log('Signature is invalid')
      return false
    }

    return true
  }

  const koa = new Koa() as any
  const io = new IO()

  io.attach(koa)

  koa._io.on('connection', (socket: any) => {
    socket.on('request', async(msg: any) => {
      try {
        const payload = JSON.parse(msg)
        if (!payload.type) {
          socket.send('{"error": "Missing type on message"}')
        }
        if (payload.type === 'associate') {
          return handleAssociate(socket, payload)
        }
        if (payload.type === 'create') {
          return handleMessage(socket, payload)
        }
        if (payload.type === 'multiple') {
          return handleMultiple(socket, payload)
        }

      } catch (error) {
        console.log('Error creating request', error, error.stack)
      }
    })
    socket.emit('connected')
  })

  koa.use(Body())

  koa.use(Route.post('/request', async (ctx: any) => {
    const id = uuid.v4()
    const request = makeRequest(id, ctx.request.body, false)

    requests[id] = request

    ctx.response.body = id
  }))

  koa.use(Route.get('/request/:id', async (ctx: any, id: string) => {
    if (requests[id]) {
      ctx.response.body = requests[id]
    } else {
      ctx.response.status = 404
    }
  }))

  async function handleResponse(ctx: any, id: string) {
    const signature: Signature = await ctx.request.body

    console.log(signature)

    if (validSignature(id, signature)) {
      console.log('Accepted')
      ctx.response.body = '{"success": true}'
      if (mappingToWebsocket[id]) {
        mappingToWebsocket[id].send(JSON.stringify({
          id,
          request: requests[id],
          signature
        }))
      }
    } else {
      console.log('Rejected')
      ctx.response.body = '{"success": false}'
    }
  }

  async function handleMultipleResponse(ctx: any, id: string) {
    const signatures: Signature[] = await ctx.request.body

    console.log(signatures)

    if (validSignatures(id, signatures)) {
      console.log('Accepted')
      ctx.response.body = '{"success": true}'
      if (mappingToWebsocket[id]) {
        mappingToWebsocket[id].send(JSON.stringify({
          id,
          request: requests[id],
          signatures
        }))
      }
    } else {
      console.log('Rejected')
      ctx.response.body = '{"success": false}'
    }
  }

  koa.use(Route.post('/request/:id', handleResponse))

  koa.use(Route.post('/multiple/:id', handleMultipleResponse))

  koa.use(async (ctx: any, next: Function) => {
    try {
      await next()
    } catch (error) {
      console.log(`Error processing ${ctx.method} ${ctx.path}`, error, error.stack)
    }
  })

  return koa
}

export async function start(options: AuthServerOptons) {
  options = Object.assign({}, {
    port: 5000
  }, options || {})
  const server = await createServer(options)
  await server.listen(options.port)

  console.log('Server started successfully.')
}

if (!module.parent) {
  start({ port: 5000 }).catch(error => {
    console.log('Unable to start Trusted Publisher server:', error, error.stack)
  })
}
