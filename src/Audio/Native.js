// Effect Games Engine v1.0
// Copyright (c) 2005 - 2011 Joseph Huckaby
// Source Code released under the MIT License: 
// http://www.opensource.org/licenses/mit-license.php

////
// Native.js
// Provides native audio services through HTML5
// DHTML Game Engine 1.0 (EffectGames.com)
////

function _NativeAudioHandler() {
	// partial class definition that is merged in with _AudioHandler
	// if native audio is to be used
};

_NativeAudioHandler.prototype._getLoadProgress = function() {
	// get progress of tracks still loading
	// result will be between 0.0 and 1.0
	if (!this.enabled) return 1.0;
	
	var _total = 0;
	var _count = 0;
	
	for (var _key in this._tracks) {
		var _track = this._tracks[_key];
		if (!_track.ignore) {
			_total += _track._get_load_progress();
			_count++;
		}
	}
	
	return (_count > 0) ? (_total / _count) : 1.0;
};

_NativeAudioHandler.prototype._resetProgress = function() {
	// set current state as zero progress, for subsequent
	// loads of additional content
	for (var _key in this._tracks) {
		var _track = this._tracks[_key];
		_track.ignore = true;
	}
};

_NativeAudioHandler.prototype._setup = function(_callback) {
	// setup audio
	if (!this.enabled) return;
	
	this.setHandler('onLoad', _callback);
	this.fireHandler('onLoad');
};

//
// _NativeAudioTrack Class
//

function _NativeAudioTrack() {
	// partial class definition that is merged in with _AudioTrack
	// if flash is to be used
};

_NativeAudioTrack.prototype = new _EventHandlerBase();

_NativeAudioTrack.prototype._init = function() {
	// initialize sound settings
	if (!this._handler.enabled) return;
	assert(this._movies[0] && this._movies[0].play, "Audio object not loaded");
	
	for (var idx = 0, len = this._numMovies; idx < len; idx++) {
		this._movies[idx].volume = this._getAdjVolume();
	}
};

_NativeAudioTrack.prototype.playSound = function() {
	// play sound as effect
	// cycles through multiplex sounds round-robin style
	if (!this._handler.enabled || !this._getCategorySettings().enabled) return this;
	
	var _movie = this._movies[this._movieIdx];
	this._movieIdx++;
	if (this._movieIdx >= this._numMovies) this._movieIdx = 0;
	
	// movie.pause();
	_movie.currentTime = 0;
	// if (ua.ff && (_movie.readyState != 4)) _movie.load(); 
	_movie.play();
	
	return this; // for chaining commands
};

_NativeAudioTrack.prototype.play = function() {
	// send Play command to current audio track
	// does not support multiplex, this is for single track sounds (music)
	if (!this._handler.enabled || !this._getCategorySettings().enabled) return this;
	
	// ff hack -- sounds randomly fall out of cache and need to be reloaded -- these are invariably music tracks
	if (ua.ff && (this.category == 'music') && (this._movies[0].readyState != 4)) this._movies[0].load();
	
	this._movies[0].play();
	return this; // for chaining commands
};

_NativeAudioTrack.prototype.stop = function() {
	// send Stop command to current audio track
	// stops all multiplexed sounds for track
	if (!this._handler.enabled) return this;
	
	for (var idx = 0, len = this._numMovies; idx < len; idx++) {
		this._movies[idx].pause();
	}
	
	this._playing = false;
	
	return this; // for chaining commands
};

_NativeAudioTrack.prototype.rewind = function() {
	// send Rewind command to current audio track
	// does not support mulitplex, is only for single track sounds (music)
	if (!this._handler.enabled) return this;
	this._movies[0].currentTime = 0;
	return this; // for chaining commands
};

_NativeAudioTrack.prototype.setVolume = function(_newVolume) {
	// set volume for this track
	// sets for all multiplex sounds
	if (!this._handler.enabled) return this;
	
	if (_newVolume < 0) _newVolume = 0;
	else if (_newVolume > 1.0) _newVolume = 1.0;
	
	this.volume = _newVolume;
	
	for (var idx = 0, len = this._numMovies; idx < len; idx++) {
		this._movies[idx].volume = this._getAdjVolume();
	}
	
	return this; // for chaining commands
};

_NativeAudioTrack.prototype.setBalance = function(_newBalance) {
	// set balance for this track
	if (!this._handler.enabled) return this;
	
	if (_newBalance < -1.0) _newBalance = -1.0;
	else if (_newBalance > 1.0) _newBalance = 1.0;
	
	this.balance = _newBalance;
	var adjBalance = this._getAdjBalance();
	
	// UNSUPPORTED IN NATIVE AUDIO
	
	return this; // for chaining commands
};

_NativeAudioTrack.prototype.isPlaying = function() {
	// return true if track is playing, false if stopped
	return !!this._playing; 
};

_NativeAudioTrack.prototype.getPosition = function() {
	// return current time offset into track (hi-res seconds)
	return this._movies[0].currentTime;
};

_NativeAudioTrack.prototype.setPosition = function(_pos) {
	// set the time offset into track (hi-res seconds)
	this._movies[0].currentTime = _pos;
	return this;
};

_NativeAudioTrack.prototype.load = function() {
	// load track
	if (!this._handler.enabled) return '';
	
	if (ua.ff) this.url = this.url.replace(/\.mp3/i, '.ogg');
	
	this._mediaURL = this.url.match(/^\w+\:\/\//) ? this.url : (gGame.getGamePath() + this.url);
	if (!gGame._standalone) this._mediaURL += '?mod=' + gGame._assetModDate + '&ttl=static';
	debugstr("Loading audio track: " + this._id + " (" + this._mediaURL + ")");
	
	this._loadStart = _now_epoch();
	this.progress = 0;
	this.loading = true;
	this._playing = false;
	this._numMovies = this.multiplex ? 4 : 1;
	this._movieIdx = 0;
	this._movies = [];
	if (!this._retries) this._retries = 5;
	
	for (var idx = 0, len = this._numMovies; idx < len; idx++) {
		// safari is smart enough to only load this over TCP/IP once (tested and proven)
		var _movie = this._movies[idx] = new Audio( this._mediaURL );
		_movie.volume = this._getAdjVolume();
		_movie.loop = this._loop ? true : false;
		if (ua.ff) _movie.autobuffer = true; else _movie.autobuffer = false;
		_movie.load();
	}
	
	var _movie = this._movies[0];
	var _clip = this;
	
	_movie.addEventListener('begin', function(_ev) { 
		// sound is beginning to download
		_clip.progress = 0;
		_clip.loading = true;
		Debug.trace('audio', _clip._id + ": starting download: " + _clip._mediaURL);
	}, false);
	
	_movie.addEventListener('progress', function(_ev) { 
		// called every so often during download
		if (_ev && _ev.loaded && _ev.total) {
			_clip.progress = _ev.loaded / _ev.total;
			if (_clip.progress > _ev.total) _clip.progress = _ev.total; // safari bug
		}
		_clip.loading = true;
		Debug.trace('audio', _clip._id + ": download progress: " + _clip.progress);
	}, false);
	
	_movie.addEventListener(((ua.safari && ua.snow) || ua.ff) ? 'canplaythrough' : 'load', function() {
		// movie has finished downloading
		_clip.progress = 1.0;
		_clip.loading = false;
		_clip.loaded = true;
		Debug.trace('audio', _clip._id + ": finished download");
	}, false);
	
	_movie.addEventListener('play', function() {
		// use native loop functionality (faster than catching end event)
		Debug.trace('audio', _clip._id + ": playing");
		_movie.loop = _clip.loop ? true : false;
		_clip._playing = true;
	}, false);
	
	_movie.addEventListener('ended', function() {
		// sound has reached its end, check for loop
		Debug.trace('audio', _clip._id + ": Sound reached end");
		if (ua.ff && _clip.loop) {
			_clip.rewind();
			_clip.play();
		}
		else {
			_clip._playing = false;
			_clip.fireHandler( 'ended' );
		}
	}, false);
	
	_movie.addEventListener('error', function() {
		Debug.trace('audio', "Failed to load audio URL: " + _clip._mediaURL);
		_clip._retries--;
		if (_clip._retries > 0) {
			Debug.trace('audio', _clip._retries + " retries left, will try again in 1 sec");
			setTimeout( function() { _clip.load(); }, 1000 );
		}
		else {
			_throwError("Audio Clip Error: Cannot load: " + _clip._mediaURL);
		}
	}, false);
};

_NativeAudioTrack.prototype._get_load_progress = function() {
	// get load progress (0.0 to 1.0)
	if (ua.ff && (this.progress < 1.0) && (_now_epoch() - this._loadStart > 10.0)) {
		// firefox bug -- some OGG tracks never complete loading -- sigh
		Debug.trace('audio', "Firefox bug: Forcing ogg track " + this._id + " to think it is complete");
		this.progress = 1.0;
		this.loading = false;
		this.loaded = true;
	}
	return this.progress || 0;
};
