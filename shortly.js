var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');
var session = require('express-session');
var bcrypt = require('bcrypt-nodejs');
var KnexSessionStore = require('connect-session-knex')(session);
var store = new KnexSessionStore();

var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');

var app = express();

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));
// app.use(session({secret: 'confidential'}));
app.use(session({
  store: store,
  secret: 'c0nf1d3n+!4l',
  cookie: { maxAge: 60000 },
  // cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));


app.get('/', util.checkUser,
function(req, res) {
  console.log(req.session);
  res.render('index');
});

app.get('/create', util.checkUser,
function(req, res) {
  res.render('index');
});

app.get('/signup', 
function(req, res) {
  res.render('signup');
});

app.get('/login', 
function(req, res) {
  // destroy active session before logging in as different user
  req.session.destroy();
  res.render('login');
});

app.get('/links', util.checkUser,
function(req, res) {
  Links.reset().fetch().then(function(links) {
    res.status(200).send(links.models);
  });
});

app.post('/links', util.checkUser,
function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.sendStatus(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      res.status(200).send(found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.sendStatus(404);
        }

        Links.create({
          url: uri,
          title: title,
          baseUrl: req.headers.origin
        })
        .then(function(newLink) {
          res.status(200).send(newLink);
        });
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/
app.post('/login',
function(req, res) {
  var username = req.body.username;
  var password = req.body.password;

  new User({ username: username }).fetch().then(function(user) {
    if (user) {
      bcrypt.compare(password, user.get('password'), function(err, match) {
        if (match) {
          console.log('Logging in...');
          req.session.username = username;
          res.status(200);
          res.redirect('/');
        } else {
          console.log('Invalid password');
          res.redirect('/login');
        }
      });
    } else {
      res.redirect('/login');
      res.status(200);
    }
  });
}); 


app.post('/signup', 
function(req, res) {
  var username = req.body.username;
  var password = req.body.password;

  new User({ username: username }).fetch().then(function(found) {
    if (found) {
      res.status(200);
      res.redirect('/signup');
    } else {
      bcrypt.hash(req.body.password, null, null, function(err, hash) {
        if (err) {
          console.log('BCRYPT HASH ERROR:', err);
          res.status(200);
          res.redirect('/signup');
        } else {
          Users.create({
            username: username,
            password: hash
          })
          .then(function(user) {
            req.session.username = username;
            res.status(200);
            res.redirect('/');
          });
        }
      });
    }
  });
});

/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        linkId: link.get('id')
      });

      click.save().then(function() {
        link.set('visits', link.get('visits') + 1);
        link.save().then(function() {
          return res.redirect(link.get('url'));
        });
      });
    }
  });
});

console.log('Shortly is listening on 4568');
app.listen(4568);
