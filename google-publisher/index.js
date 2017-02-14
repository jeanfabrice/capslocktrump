#!/usr/bin/env node
var amqp       = require( 'amqplib/callback_api' );
var debug      = require( 'debug' )( 'google-publisher' );
var util       = require( 'util' );
var _          = require( 'underscore' );
var google     = require( 'googleapis' );
var googleAuth = require( 'google-auth-library' );
var fs         = require( 'fs' );
var readline   = require( 'readline' );
var config     = require( './config.json' );
var hostname   = require( 'os' ).hostname();
debug( 'config : ', config );

// If modifying these scopes, delete your previously saved credentials
// at ~/.credentials/sheets.googleapis.com-nodejs-quickstart.json
var SCOPES     = ['https://www.googleapis.com/auth/spreadsheets'];
var TOKEN_DIR  = './';
var TOKEN_PATH = TOKEN_DIR + 'user_secret.json';

// Load client secrets from a local file.
fs.readFile( TOKEN_DIR + 'client_secret.json', function processClientSecrets( err, content ) {
  if( err ) {
    console.error( 'Error loading client secret file: ' + err );
    return;
  }
  // Authorize a client with the loaded credentials, then call the
  // Google Sheets API.
  authorize( JSON.parse( content ), bootstrapAMQP );
});

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 *
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize( credentials, callback ) {
  var clientSecret = credentials.installed.client_secret;
  var clientId     = credentials.installed.client_id;
  var redirectUrl  = credentials.installed.redirect_uris[ 0 ];
  var auth         = new googleAuth();
  var oauth2Client = new auth.OAuth2( clientId, clientSecret, redirectUrl );

  // Check if we have previously stored a token.
  fs.readFile( TOKEN_PATH, function( err, token ) {
    if( err ) {
      getNewToken( oauth2Client, callback );
    }
    else {
      oauth2Client.credentials = JSON.parse( token );
      callback( oauth2Client );
    }
  });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 *
 * @param {google.auth.OAuth2} oauth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback to call with the authorized
 *     client.
 */
function getNewToken( oauth2Client, callback ) {
  var authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES
  });
  console.log( 'Authorize this app by visiting this url: ', authUrl );
  var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  rl.question( 'Enter the code from that page here: ', function( code ) {
    rl.close();
    oauth2Client.getToken( code, function( err, token ) {
      if( err ) {
        console.error( 'Error while trying to retrieve access token', err );
        return;
      }
      oauth2Client.credentials = token;
      storeToken( token );
      callback( oauth2Client );
    });
  });
}

/**
 * Store token to disk be used in later program executions.
 *
 * @param {Object} token The token to store to disk.
 */
function storeToken(token) {
  try {
    fs.mkdirSync(TOKEN_DIR);
  } catch( err ) {
    if (err.code != 'EEXIST') {
      throw err;
    }
  }
  fs.writeFile( TOKEN_PATH, JSON.stringify( token ));
  console.log( 'Token stored to ' + TOKEN_PATH );
}

function bootstrapAMQP( gAuth ) {
  amqp.connect( config.rabbitmq.url + '?heartbeat=60', function( err, conn ) {

    if( err ) {
      console.error( '[AMQP]', err.message );
      return setTimeout( function(){ bootstrapAMQP( gAuth ); }, 1000 );
    }

    conn.on( 'error', function( err ) {
      if( err.message !== 'Connection closing' ) {
        console.error( '[AMQP] conn error', err.message );
      }
    });

    conn.on( 'close', function() {
      console.error( '[AMQP] reconnecting...' );
      return setTimeout( function(){ bootstrapAMQP( gAuth ); }, 1000 );
    });

    console.log( '[AMQP] connected' );

    start( gAuth, conn );

  });
}

function filter( arrayOfCaps ) {

  arrayOfCaps = _.map( arrayOfCaps, function( caps ) {
    _.each( config.filter, function( f ){
      var re = new RegExp( f.in, "g" );
      caps = caps.replace( re, f.out );
    })
    return caps;
  })
  debug( 'filter stage #1: ', arrayOfCaps );

  arrayOfCaps = _.filter( arrayOfCaps, function( caps ) {
    return caps;
  })
  debug( 'filter stage #2:', arrayOfCaps );

  return arrayOfCaps;
}

function start( auth, amqpConn ) {
  var sheets = google.sheets( 'v4' );
  amqpConn.createChannel( function( err, ch ) {

    ch.assertExchange( config.rabbitmq.exchange, 'direct', { durable: true });

    ch.assertQueue( hostname, { durable: true }, function( err, q ) {
      console.log(' [*] Waiting for data. To exit press CTRL+C' );

      ch.bindQueue( q.queue, config.rabbitmq.exchange, config.rabbitmq.routein );
      ch.consume( q.queue, function( msg ) {
        var tweet = JSON.parse( msg.content.toString() );
        var filtered = filter( tweet.filtered );
        console.log( 'Got data : ', tweet.text );
        debug( 'Received a few data to publish: ', tweet );
        _.each( filtered, function( f ) {
          sheets.spreadsheets.values.append({
            auth: auth,
            spreadsheetId: config.googleSheetId,
            range: 'A2',
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            resource: {
              "range": 'A2',
              "majorDimension": 'ROWS',
              "values": [ [ '@' + tweet.user.screen_name, tweet.created_at, f, tweet.text, 'https://twitter.com/' + tweet.user.screen_name + '/status/' + tweet.id_str ] ]
            }
          }, function( err ) {
            if( err ) {
              console.error( 'The Google API returned an error: ', util.inspect( err ) );
              return;
            }
            console.log( 'Published!' );
          });
        })
      },
      {
        noAck: true
      });
    });
  });
}
