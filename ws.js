//-----------------------------------------------------------------------------
var app = require('express')();

var http = require('http');
var server = http.createServer(app);

var sio = require('socket.io')(server);

var shelp = require('./modules/stream-helpers.js');
var yad = require('./modules/yad.js');
//-----------------------------------------------------------------------------

const binFileContent = 0;
const textFileContent = 1;

var cachedFiles = 
[
    {mode : binFileContent, path : './jquery/jquery.js.gz'},
    {mode : textFileContent, path : './jquery/jquery.js'},
    {mode : textFileContent, path : './pages/master-submit.html'},
    {mode : textFileContent, path : './scripts/client-api.js'}
];

const jqgzip = 0;
const jqnogzip = 1;
const mipage = 2;
const cliapis = 3;

//-----------------------------------------------------------------------------

var connectedClients = {};

var channel = 'message';

//-----------------------------------------------------------------------------

var yadToken = 'AQAAAAAM8pOsAAOMAee8rd1rxUI2sfd1UoI-k7k';

var yd = yad.createClient(yadToken);

//-----------------------------------------------------------------------------

const htmlType = 'text/html';
const textType = 'text/plain';
const jsonType = 'application/json';

const ctHtml = {'Content-Type': htmlType};
const ctText = {'Content-Type': textType};
const ctTextGz = {'Content-Type': textType, 'Content-Encoding': 'gzip'};
const ctJson = {'Content-Type': jsonType};

//-----------------------------------------------------------------------------

const htmlStartSequence = '<html><script src="/socket.io/socket.io.js"></script><script src="jquery.js"></script><script>';
                            // injected script will go here
const htmlEndSequence = '</script><body></body></html>';

//-----------------------------------------------------------------------------

app.get('/', function(req, res){
    
        // to do: inject slave station page with worker script
    res.set(ctText);
    res.send('Use /master');    
});

app.get('/master', function(req, res){
    
    res.set(ctHtml);
    res.send(cachedFiles[mipage].content);    
});

app.get('/jquery.js', function(req, res){
    
    if(req.acceptsEncodings('gzip'))
    {
        res.set(ctTextGz);
        res.send(cachedFiles[jqgzip].content);
    }
    else
    {
        res.set(ctText);
        res.send(cachedFiles[jqnogzip].content);
    }
});

app.post('/', function(req, res){
    
    if(req.query.useMi)
    {
        shelp.asyncReadTextStream(req, function(postedContent){
            
            var pageContent = 
                htmlStartSequence + '\n' +
                cachedFiles[cliapis].content + '\n' +
                postedContent +
                htmlEndSequence;
            
            res.set(ctHtml);
            res.send(pageContent);    
        });
    }
    else
    {
        res.sendStatus(501);
    }
});

//-----------------------------------------------------------------------------

const errUnknownCommand = 'Unknown command: ';

var commandsRegistry = 
{
    'YAD_READ_FILE' : yadReadFile,
    'YAD_WRITE_FILE' : yadWriteFile
};

function yadReadFile(args, reason, socketToAnswer)
{
        // path, asBinaryContent
    yd.readFile(args[0], args[1], function(err, response){
        
        socketToAnswer.emit(channel, {reason: reason, yadTransaction: {error: err, response: response}});
    });
}

function yadWriteFile(args, reason, socketToAnswer)
{
        // path, asBinaryContent, content
    yd.writeFile(args[0], args[1], args[2], function(err, response){
        
        socketToAnswer.emit(channel, {reason: reason, yadTransaction: {error: err, response: response}});
    });
}

//-----------------------------------------------------------------------------

function executeCommand(command, args, reason, socketToAnswer)
{
    // reason must be unique token, sent by client to identify returned info
    
    var commandEntry = commandsRegistry[command];
    
    if(commandEntry)
    {
        commandEntry(args, reason, socketToAnswer);
    }
    else 
    {
        socketToAnswer.emit(channel, {reason: reason, error: errUnknownCommand + command});
    }
}

//-----------------------------------------------------------------------------

function onMessage(message)
{
    console.log('message from ' + this.socket.id);

    if(message.command)
    {
        executeCommand(message.command, message.args, message.reason, this.socket);            
    }
}

function onDisconnect(reason)
{
    console.log('disconnect ' + this.socket.id + ' by reason: ' + reason);
    
    delete connectedClients[this.socket.id];
}

function onConnect(socket)
{
    var entry = {socket: socket};

    connectedClients[socket.id] = entry;
    
    console.log('connect ' + socket.id);
    
    socket.on('disconnect', onDisconnect.bind(entry));
    
    socket.on(channel, onMessage.bind(entry));
}

sio.on('connect', onConnect);

//-----------------------------------------------------------------------------

function startServer()
{
    server.listen(process.env.PORT);
    
    console.log("Server is running");
}

//-----------------------------------------------------------------------------

shelp.asyncCacheFiles(cachedFiles, 

        // on progress
    function(path, content){
        
        console.log('cached: ' + path + ' (' + content.length + ' bytes)');        
    }, 
        // on all done ok
    function(){
    
        startServer();
    }, 
        // on fail
    function(){
        
        console.log('Failed to precache files:');
        
        cachedFiles.map(function(entry){
            
            if(!entry.content)
            {
                console.log(entry.path);
            }
        });
    });

//-----------------------------------------------------------------------------