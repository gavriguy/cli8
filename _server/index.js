require('dotenv').config();

const Hapi = require('hapi');
const Bell = require('bell');
const AuthCookie = require('hapi-auth-cookie');
const Inert = require('inert');
const Vision = require('vision');
const Hoek = require('hoek');

const BASE_URL = 'https://accounts.applicaster.com';
const authorizedDomain = 'applicaster.com';
const encryptionPassword = 'cookie-encryption-password-cookie-encryption-password';

const server = new Hapi.Server();
server.connection({port: process.env.PORT});
server.register([Bell, AuthCookie, Inert, Vision], function(err) {
  Hoek.assert(!err, err);
  server.views({
    engines: {
      html: require('handlebars'),
    },
    relativeTo: __dirname,
    path: 'templates',
  });

  const authCookieOptions = {
    password: encryptionPassword,
    cookie: 'applicaster-cookie',
    redirectTo: '/login',
    isSecure: false,
  };
  server.auth.strategy('applicaster-cookie', 'cookie', authCookieOptions);

  const bellAuthOptions = {
    provider: {
      protocol: 'oauth2',
      auth: `${BASE_URL}/oauth/authorize`,
      token: `${BASE_URL}/oauth/token`,
      scopeSeparator: ',',
      profile: (credentials, params, get, callback) => {
        get(`${BASE_URL}/api/v1/users/current.json`, params, profile => {
          credentials.profile = profile;
          return callback();
        });
      },
    },
    password: encryptionPassword,
    clientId: process.env.CLIENT_ID || 'CLIENT_ID',
    clientSecret: process.env.CLIENT_SECRET || 'CLIENT_SECRET',
    isSecure: false,
  };

  server.auth.strategy('oauth', 'bell', bellAuthOptions);

  server.route([
    {
      method: ['GET'],
      path: '/login',
      config: {
        handler: function(request, reply) {
          request.cookieAuth.clear();
          return reply.view('refresh', {to: '/bell/door'});
        },
      },
    },
    {
      method: ['GET'],
      path: '/bell/door',
      config: {
        auth: 'oauth',
        handler: function(request, reply) {
          if (request.auth.isAuthenticated) {
            const {email} = request.auth.credentials.profile;
            request.cookieAuth.set({
              email: email,
            });
            return reply.view('refresh', {to: '/'});
          }
          return reply
            .view('login', {
              error: 'Faild to login',
            })
            .code(401);
        },
      },
    },
    {
      method: ['GET'],
      path: '/{param*}',
      config: {
        auth: (process.env.USE_ACCOUNTS_AUTH == '1') ? 'applicaster-cookie' : false,
        handler: {
          directory: {
            path: './_book',
            listing: true,
          },
        },
      },
    },
  ]);

  server.start(function(err) {
    if (err) {
      console.error(err);
      return process.exit(1);
    }
    console.log('Server started at %s', server.info.uri);
  });
});
