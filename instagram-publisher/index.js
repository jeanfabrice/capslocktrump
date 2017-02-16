#!/usr/bin/env node
var amqp        = require( 'amqplib/callback_api' );
var debug       = require( 'debug' )( 'instagram-publisher' );
var util        = require( 'util' );
var _           = require( 'underscore' );
var hostname    = require( 'os' ).hostname();
var Instagram   = require( 'instagram-private-api' ).V1;
var config      = require( './config.json' );
var credentials = require( './credentials.json' );
var dateformat  = require( 'dateformat' );
var gm          = require( 'gm' ).subClass({imageMagick: true});
debug( 'config: ', config );
debug( 'credentials: ', credentials );

var device  = new Instagram.Device( credentials.username );
var storage = new Instagram.CookieFileStorage( __dirname + credentials.username + '.json' );

function bootstrapAMQP() {
  amqp.connect( config.rabbitmq.url + '?heartbeat=60', function( err, conn ) {

    if( err ) {
      console.error( '[AMQP]', err.message );
      return setTimeout( bootstrapAMQP, 1000 );
    }

    conn.on( 'error', function( err ) {
      if( err.message !== 'Connection closing' ) {
        console.error( '[AMQP] conn error' + err.message );
      }
    });

    conn.on( 'close', function() {
      console.error( '[AMQP] reconnecting...' );
      return setTimeout( bootstrapAMQP, 1000 );
    });

    console.log( '[AMQP] connected' );

    start( conn );

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

  return config.allinone ? [ arrayOfCaps.join( "\n" ) ] : arrayOfCaps;
}

function start( amqpConn ) {
  amqpConn.createChannel( function( err, ch ) {

    ch.assertExchange( config.rabbitmq.exchange, 'direct', { durable: true });

    ch.assertQueue( hostname, { durable: true }, function( err, q ) {
      console.log(' [*] Waiting for data. To exit press CTRL+C' );

      ch.bindQueue( q.queue, config.rabbitmq.exchange, config.rabbitmq.routein );
      ch.consume( q.queue, function( msg ) {
        var tweet    = JSON.parse( msg.content.toString() );

        console.log( 'Got data : ', tweet.text );
        debug( 'Received a few data to instagram: ', tweet );

        var date     = dateformat( new Date( tweet.created_at ), 'mmmm. d. yyyy' ).toUpperCase();
        var caption  = date + ".\n" + '"' + tweet.text + '"';
        var filtered = filter( tweet.filtered );

        _.each( filtered, function( f, i ) {
          gm( './template.jpg' )
          .in( '-interline-spacing', config.gm.interline )
          .fill( config.gm.textColor )
          .font( './font.otf')
          .fontSize( config.gm.fontSize )
          .drawText( 0, 0, f, 'Center' )
          .write( './photo' + i + '.jpg', function ( err ) {
            if( err ) {
              console.error( 'Error while creating picture: ', err );
            }
            else {
              Instagram.Session.create( device, storage, credentials.username, credentials.password )
              .then( function( session ) {
                Instagram.Upload.photo( session, './photo' + i + '.jpg' )
                .then( function( upload ) {
                    debug( 'Instagram upload id:', upload.params.uploadId );
                    return Instagram.Media.configurePhoto( session, upload.params.uploadId, caption );
                })
                .then( function( medium ) {
                  console.log( 'Instagrammed!' );
                });
              });
            }
          });
        });
      },
      {
        noAck: true
      });
    });
  });
}

bootstrapAMQP();


