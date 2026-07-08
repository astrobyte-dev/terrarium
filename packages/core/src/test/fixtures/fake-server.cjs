// Test fixture: binds a port and stays alive until killed.
const net = require('net')
const port = Number(process.argv[2])
const server = net.createServer(() => {})
server.listen(port, '127.0.0.1', () => console.log(`listening on ${port}`))
setInterval(() => {}, 1000)
