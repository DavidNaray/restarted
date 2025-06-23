const jwt = require('jsonwebtoken');

const ACCESS_TOKEN_SECRET = "your_access_secret_here";
const REFRESH_TOKEN_SECRET = "your_refresh_secret_here";

// Middleware to authenticate token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, ACCESS_TOKEN_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user; // { username: ... }
    next();
  });
}

function RefreshToken(user){
  return jwt.sign({ username: user.username }, REFRESH_TOKEN_SECRET);
}


function AccessToken(user){
  return jwt.sign({ username: user.username,id:user._id.toString() }, ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
}

function verify(refreshToken){
  return jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);
}

function socketUtil(socket,token,next){
  jwt.verify(token, ACCESS_TOKEN_SECRET, (err, user) => {
    if (err) return next(new Error('Invalid token'));
    socket.user = user; // Attach user to socket for use in other handlers
    socket.userId=user.id
    next();
  });
}

module.exports.authenticateTokenImport=authenticateToken
module.exports.RefreshTokenImport=RefreshToken
module.exports.AccessTokenImport=AccessToken
module.exports.verifyImport=verify
module.exports.socketUtilImport=socketUtil