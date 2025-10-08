const express = require('express');
const http = require('http');
const cors = require('cors');
const RateLimit = require('express-rate-limit');
const port = 3000;

const app = express();
app.set('trust proxy', true);  // 이 줄을 추가

var limiter = RateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100,
  validate: false
});

app.use(limiter);
app.use(cors({ origin: 'http://localhost:3000' }));
app.use('/', express.static(__dirname));

app.get('/', function (req, res) {
  res.sendFile(__dirname + '/index.html');
});

app.get('/ws-streaming', function (req, res) {
  res.sendFile(__dirname + '/index-ws.html');
});

const server = http.createServer(app);

server.listen(port, () =>
  console.log(
    `Server started on port localhost:${port}\nhttp://localhost:${port}\nhttp://localhost:${port}/ws-streaming`
  )
);
