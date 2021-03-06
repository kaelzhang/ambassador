'use strict';

var ambassador = module.exports = {};

var lockup      = require('lockup');
var fs          = require('fs-sync');
var code        = require('code-this');
var node_path   = require('path');
var EE          = require('events').EventEmitter;

ambassador.__proto__ = EE.prototype;

var PID = process.pid;

var USER_HOME = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
var ROOT = node_path.join(USER_HOME, '.node_ambassador');

// > The '`SIGUSR1`' and '`SIGUSR2`' signals are sent to a process to indicate user-defined conditions.
// But '`SIGUSR1`' is already used by node.js for debugging
var REAL_SIGNAL = 'SIGUSR2';

if( !fs.exists( ROOT ) ){
    fs.mkdir(ROOT);
}


function get_file_path (pid) {
    return node_path.join(ROOT, pid + '.js');
}


// Send data to a process with id `pid`
// @param {number} pid the pid number of the process to send message to
// @param {string} signal the signal name
// @param {mixed} data
ambassador.send = function (pid, signal, data) {
    if(pid){
        var data_file = get_file_path(pid);

        lockup.lock(data_file + '.lock', function (err) {
            if(err){
                return;
            }

            fs.write(
                data_file, 
                'module.exports = ' + code({
                    from: PID,
                    signal: signal,
                    data: data
                })
            );

            // if the process doesn't exist, there will be a 'ESRCH' error thrown by the underlying system.
            // `try` it, and release the lock
            try {
                process.kill(pid, REAL_SIGNAL);
            } catch(e) {
                lockup.unlock(data_file);
            }
        });
    }

    return ambassador;
};


process.on(REAL_SIGNAL, function () {
    var data_file = get_file_path(PID);
    var data;

    try {
        data = require(data_file);
    } catch(e) {}

    if(data){
        ambassador.emit(data.signal, data.from, data.data);
    }

    fs.remove(data_file);
    lockup.unlock(data_file + '.lock');
});


// Safely kill a process with ambassador
ambassador.kill = function (pid) {
    ambassador.send(pid, '__kill');
};


ambassador.on('__kill', function () {
    process.exit(0);
});



