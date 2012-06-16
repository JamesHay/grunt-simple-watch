/*
 * grunt
 * https://github.com/cowboy/grunt
 *
 * Copyright (c) 2012 Amir Souchami
 * This file is based on the grunt/tasks/watch.js written by "Cowboy" Ben Alman
 * changes where made to get rid of the problematic use of fs.watch because sadly it did not respond on my server setup
 *
 * Licensed under the MIT license.
 * http://benalman.com/about/license/
 */

module.exports = function(grunt) {

	// Nodejs libs.
	var fs = require('fs');
	var path = require('path');

	// ==========================================================================
	// TASKS
	// ==========================================================================

	// Keep track of last modified times of files, in case files are reported to
	// have changed incorrectly.
	var mtimes = {};

	grunt.registerTask('simpler_watch', 'Run predefined tasks whenever watched files change.', function(target) {
		this.requiresConfig('watch');
		// Build an array of files/tasks objects.
		var watch = grunt.config('watch');
		var targets = target ? [target] : Object.keys(watch).filter(function(key) {
			return typeof watch[key] !== 'string' && !Array.isArray(watch[key]);
		});
		targets = targets.map(function(target) {
			// Fail if any required config properties have been omitted.
			target = ['watch', target];
			this.requiresConfig(target.concat('files'), target.concat('tasks'));
			return grunt.config(target);
		}, this);

		// Allow "basic" non-target format.
		if (typeof watch.files === 'string' || Array.isArray(watch.files)) {
			targets.push({files: watch.files, tasks: watch.tasks});
		}

		grunt.log.write('Waiting for file updates on shared folder...');

		// This task is asynchronous.
		var taskDone = this.async();
		// Get a list of files to be watched.
		var patterns = grunt.utils._.chain(targets).pluck('files').flatten().uniq().value();
		var getFiles = grunt.file.expandFiles.bind(grunt.file, patterns);
		// The tasks to be run.
		var tasks = []; //grunt.config(tasksProp);
		// This task's name + optional args, in string format.
		var nameArgs = this.nameArgs;
		// An ID by which the setInterval can be canceled.
		var intervalId;
		// Files that are being watched.
		var watchedFiles = {};
		// File changes to be logged.
		var changedFiles = {};

		// Define an alternate fail "warn" behavior.
		grunt.fail.warnAlternate = function() {
			grunt.task.clearQueue({untilMarker: true}).run(nameArgs);
		};

		// Cleanup when files have changed. This is debounced to handle situations
		// where editors save multiple files "simultaneously" and should wait until
		// all the files are saved.
		var done = grunt.utils._.debounce(function() {
			// Clear the files-added setInterval.
			clearInterval(intervalId);
			// Ok!
			grunt.log.ok();
			var fileArray = Object.keys(changedFiles);
			fileArray.forEach(function(filepath) {
				// Log which file has changed, and how.
				grunt.log.ok('File "' + filepath + '" ' + changedFiles[filepath] + '.');
				// Clear the modified file's cached require data.
				grunt.file.clearRequireCache(filepath);
			});
			// Unwatch all watched files.
			Object.keys(watchedFiles).forEach(unWatchFile);
			// For each specified target, test to see if any files matching that
			// target's file patterns were modified.
			targets.forEach(function(target) {
				var files = grunt.file.expandFiles(target.files);
				var intersection = grunt.utils._.intersection(fileArray, files);
				// Enqueue specified tasks if a matching file was found.
				if (intersection.length > 0 && target.tasks) {
					grunt.task.run(target.tasks).mark();
				}
			});
			// Enqueue the watch task, so that it loops.
			grunt.task.run(nameArgs);
			// Continue task queue.
			taskDone();
		}, 250);

		// Handle file changes.
		function fileChanged(status, filepath) {
			// If file was deleted and then re-added, consider it changed.
			if (changedFiles[filepath] === 'deleted' && status === 'added') {
				status = 'changed';
			}
			// Keep track of changed status for later.
			changedFiles[filepath] = status;
			// Execute debounced done function.
			done();
		}

		// Watch a file.
		function watchFile(filepath) {
			if (!watchedFiles[filepath]) {
				// add a new file to watched files
				watchedFiles[filepath] = fs.statSync(filepath);
				mtimes[filepath] = +watchedFiles[filepath].mtime;
			}
		}

		// Unwatch a file.
		function unWatchFile(filepath) {
			if (watchedFiles[filepath]) {
				// Close watcher.
				// watchedFiles[filepath].close();
				// Remove from watched files.
				delete watchedFiles[filepath];
			}
		}

		// Watch all currently existing files for changes.
		getFiles().forEach(watchFile);

		// Watch for files to be added.
		intervalId = setInterval(function() {
			var currFiles = getFiles();
			var lastWatched = Object.keys(watchedFiles);

			// Files that have been added since last interval execution.
			var added = grunt.utils._.difference(currFiles, lastWatched);
			added.forEach(function(filepath) {
				// This file has been added.
				fileChanged('added', filepath);
				// Watch this file.
				watchFile(filepath);
			});

			// Files that have been deleted since last interval execution.
			var deleted = grunt.utils._.difference(lastWatched,currFiles);
			deleted.forEach(function(filepath) {
				// This file has been deleted.
				fileChanged('deleted', filepath);
				// UN-Watch this file.
				unWatchFile(filepath);
			});

			currFiles.forEach(function(filepath){
				// Get last modified time of file.
				var mtime = +fs.statSync(filepath).mtime;
				// If same as stored mtime, the file hasn't changed.
				if (mtime === mtimes[filepath]) { return; }
				// Otherwise it has, store mtime for later use.
				mtimes[filepath] = mtime;
				// the file has been changed
				fileChanged('changed', filepath);
			});
		}, 200);
	});

};