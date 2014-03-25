'use strict';

var App = require('./app');
var http = require('http');
var path = require('path');
var config = require('./config');
var Connection = require('./connection');
var jade = require('jade');
//var mu = require('mu2');
var Q = require('q');
var argv = require('minimist')(process.argv.slice(2));

exports = module.exports = function(options) {
	config.basePath = path.resolve('./');

	var app = new App();
	var runCalled = false;

	//todo: we should simply return the app directly
	return {
		//todo: create a new view class—instead of setting the views class here
		//the view is only exposed so the user can set the render method
		view: app.views,
		models: app.models,
		controllers: app.controllers,
		server: null,
		run: function() {
			if(runCalled) {
				throw new Error();
			}

			runCalled = true;

			var startWorkerWithName = argv.worker || argv.w;
			var startAllWorkers = argv['all-workers'];
			if(startWorkerWithName || startAllWorkers) {
				return Q.all([
					app.models.setup(path.join(config.basePath, 'models')),
					app.workers.setup(path.join(config.basePath, 'workers'))
				])
				.then(function() {
					if(startAllWorkers) {
						return app.workers.startAll();
					}
					else {
						return app.workers.start(startWorkerWithName);
					}
				})
				.fail(function(error) {
					console.log(error);
					console.log('Error when starting, bleh.');
					return false;
				});
			}
			else {
				app.views.contentType = 'text/html';
				app.views.render = function(filePath, models) {
					return Q.nfcall(jade.renderFile, filePath, models);
				};

				this.server = http.createServer(function(request, response) {
					app.parseConnection.call(app, new Connection(request, response));
				});

				var self = this;
				return Q.all([
					app.controllers.setup(path.join(config.basePath, 'controllers'), app.models),
					app.views.setup(path.join(config.basePath, 'views')),
					app.models.setup(path.join(config.basePath, 'models')),
					app.workers.setup(path.join(config.basePath, 'workers'))
				])
				.then(function() {
					if(!process.env.PORT) {
						// TODO: implement some kind of logging functionality
						if(process.env.NODE_ENV != 'test') {
							console.log('*** WARNING: PORT not set. Setting to default port 3000.');
						}

						process.env.PORT = 3000;
					}

					if(process.env.NODE_ENV != 'test') {
						console.log('Start server on ' + process.env.PORT);
					}

					return self.server.listen(process.env.PORT);
				})
				.fail(function(error) {
					console.log(error);
					console.log(error.stack);
					console.log('Error when starting, bleh.');
					return false;
				});
			}
		}
	};
};