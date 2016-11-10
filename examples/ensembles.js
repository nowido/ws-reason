//-----------------------------------------------------------------------------
function logInfo(info)
{
    $('#info').append('<p>' + info + '</p>');

    var h = $('#info').height();
    $('#rootContainer').scrollTop(h);
}
//-----------------------------------------------------------------------------

////////////////// Unnormalized ANFIS model stuff

function UnormAnfis(pointDimension, rulesCount)
{
	this.pointDimension = pointDimension;
	this.rulesCount = rulesCount;
	
		// rule entry: (a list, q list, k list), b single
		
	this.ruleEntrySize = 3 * pointDimension + 1; 
}

UnormAnfis.prototype.useParameters = function(parametersArray)
{
		// parameters: if 2d layout, rows are rule entries
		
	this.modelParameters = parametersArray;
	
	return this;
}

UnormAnfis.prototype.useTabPoints = function(pointsDataArray)
{
        // argument array contains no known output (just X, not X:Y)
	    // if 2d layout, rows are different points
	    
    this.currentTabPoints = pointsDataArray;
    
    var previousPointsCount = this.currentTabPointsCount;
    
    this.currentTabPointsCount = pointsDataArray.length / this.pointDimension;
    
    if(previousPointsCount != this.currentTabPointsCount)
    {
        this.currentTabOutput = new Float64Array(this.currentTabPointsCount);
        this.needRecreateTemps = true;    
    }
    
	return this;		
}

UnormAnfis.prototype.evauateTabPoints = function()
{
	// finds model output for current tab points 
	// (used in direct application)
    
	var pointsCount = this.currentTabPointsCount;	
	var rulesCount = this.rulesCount;
	var ruleEntrySize = this.ruleEntrySize;
	var pointDimension = this.pointDimension;
	var modelParameters = this.modelParameters;
	
	var X = this.currentTabPoints;
	var Y = this.currentTabOutput;
	
	var point_offset = 0;
    
	for(var p = 0; p < pointsCount; ++p)
	{
		var s = 0;
		
		var rule_offset = 0; 
		
		var q_offset = pointDimension;
		var k_offset = 2 * pointDimension;
		var b_offset = 3 * pointDimension;
		
		for(var r = 0; r < rulesCount; ++r)
		{
			var muProduct = 0;
									
			var L = modelParameters[b_offset];
						
			for(var i = 0; i < pointDimension; ++i)
			{
				var arg = X[point_offset + i];

				var a = modelParameters[rule_offset + i];
				var q = modelParameters[q_offset + i];
				
				var t = (arg - a) / q;
				
				muProduct -= t * t;
				
				L += arg * modelParameters[k_offset + i];				
			}
			
			muProduct = Math.exp(muProduct);
			
			s += L * muProduct;			
			
			rule_offset += ruleEntrySize;
			
			q_offset += ruleEntrySize;
			k_offset += ruleEntrySize;
			b_offset += ruleEntrySize;
		}	
		
		Y[p] = s;
		
		point_offset += pointDimension;	
	}
		
	return this;
}

////////////////// end of Unnormalized ANFIS model stuff

//-----------------------------------------------------------------------------
function getItems(token, commander, minItemsCount, nextProc)
{
    var path = 'models/' + token;
    
    var itemsRegistry = {downloaded: 0, failed: 0, entries: {}};
    
    function registerItem(context)
    {
        if(context.message.yadTransaction && !context.message.yadTransaction.error)
        {
            ++itemsRegistry.downloaded;
            
            logInfo('*downloaded ' + context.name);
            
            itemsRegistry.entries[context.name] = context.message.yadTransaction.response;
        }
        else
        {
            ++itemsRegistry.failed;
            
            logInfo('*failed ' + context.name);
        }
        
        var responded = itemsRegistry.downloaded + itemsRegistry.failed;
        
        if(responded === itemsRegistry.total)
        {
            if(itemsRegistry.failed === 0)
            {
                logInfo('All items downloaded');
                
                nextProc(itemsRegistry.entries);
            }
            else
            {
                logInfo('Failed to gather items');
                
                nextProc(null);
            }
        }
    }
    
    function selectNames(objList, count)
    {
        var names = {};
        
        for(var i = 0; i < count; ++i)   
        {
            var randomIndex;
            var name;
            
            do
            {
                randomIndex = Math.floor(Math.random() * objList.length);    
                
                name = objList[randomIndex].name;
            }
            while(names[name]);
            
            names[name] = true;
        }
        
        return Object.keys(names);
    }
    
    function processItemsList(context)
    {
        if(context.message.yadTransaction && !context.message.yadTransaction.error)
        {
            var responseObject = JSON.parse(context.message.yadTransaction.response);
            
            var items = responseObject._embedded.items;
            
            if(items.length >= minItemsCount)
            {
                itemsRegistry.total = minItemsCount;    
                
                var names = selectNames(items, minItemsCount)
                
                for(var i = 0; i < names.length; ++i)   
                {
                    var name = names[i];
                    
                    commander.issueCommand('YAD_READ_FILE', [path + '/' + name, false], registerItem, {name: name});
                }
            }
            else
            {
                logInfo('Not enough items to compose required ensemble. Stopped');
            }
        }
        else
        {
            logInfo('*error: ' + JSON.stringify(context.message));
        }
    }
    
    commander.issueCommand('YAD_LIST_ELEMENTS', [path, ['_embedded.items.name'], 100, 0], processItemsList);    
}
//-----------------------------------------------------------------------------
function retrieveFullCollection(token, commander, nextProc)
{
    var path = 'data/' + token + '/chunks';
    
    var chunksRegistry = {downloaded: 0, failed: 0, entries: {}};
    
    function gatherCollection()
    {
        var names = Object.keys(chunksRegistry.entries);
        
        var count = names.length;
        
        var collection = [];
        
        for(var i = 0; i < count; ++i)
        {
            var name = names[i];
            
            var lowIndex = parseInt(name.substring(0, name.indexOf('-'))); 
            
            var content = JSON.parse(chunksRegistry.entries[name]);
            
            var recordsCount = content.length;
            
            for(var j = 0; j < recordsCount; ++j)
            {
                collection[lowIndex + j] = JSON.parse('[' +content[j] + ']');
            }
        }
        
            // array of arrays
        return collection;
    }
    
    function registerChunk(context)
    {
        if(context.message.yadTransaction && !context.message.yadTransaction.error)
        {
            ++chunksRegistry.downloaded;
            
            logInfo('*downloaded ' + context.name);
            
            chunksRegistry.entries[context.name] = context.message.yadTransaction.response;
        }
        else
        {
            ++chunksRegistry.failed;
            
            logInfo('*failed ' + context.name);
        }
        
        var responded = chunksRegistry.downloaded + chunksRegistry.failed;
        
        if(responded === chunksRegistry.total)
        {
            var collection;
            
            if(chunksRegistry.failed === 0)
            {
                logInfo('All chuncks downloaded');
                
                collection = gatherCollection();
            }
            else
            {
                logInfo('Failed to gather chunks');
                
                collection = null;
            }
            
            nextProc(collection);
        }
    }
    
    function processItemsList(context)
    {
        if(context.message.yadTransaction && !context.message.yadTransaction.error)
        {
            var responseObject = JSON.parse(context.message.yadTransaction.response);
            
            var items = responseObject._embedded.items;
            
            chunksRegistry.total = items.length;
                    
            for(var i = 0; i < items.length; ++i)   
            {
                var name = items[i].name;
                
                commander.issueCommand('YAD_READ_FILE', [path + '/' + name, false], registerChunk, {name: name});
            }
        }
        else
        {
            logInfo('*error: ' + JSON.stringify(context.message));
        }
    }
    
    commander.issueCommand('YAD_LIST_ELEMENTS', [path, ['_embedded.items.name'], 100, 0], processItemsList);
}
//-----------------------------------------------------------------------------
function testEnsemble(collection, models)
{
    var recordsCount = collection.length;
    var fieldsCount = collection[0].length;
    var yIndex = fieldsCount - 1;

    var tabData = new Float64Array(recordsCount * yIndex);
    
    var ensembleOutput = new Float64Array(recordsCount);
    
        //
        
    var votes0 = [];
    var votes1 = [];
    
    for(var row = 0; row < recordsCount; ++row)
    {
        votes0[row] = votes1[row] = 0;    
    }
    
        // find average separator (to do: invent method for non-trivial separators using)
        
    var ySeparatorAverage = 0;
    
        // evaluate every model and sum their output
        
    for(var i = 0; i < models.length; ++i)
    {
        var model = models[i];
        
        ySeparatorAverage += model.ySeparator;
        
        var ranges = [];
        
        for(var col = 0; col < yIndex; ++col)
        {
            ranges[col] = model.rangesMax[col] - model.rangesMin[col];
        }

        // map test tab points to these ranges
        
        var tabIndex = 0;
        
        for(var row = 0; row < recordsCount; ++row)
        {
            var record = collection[row];
            
            for(var col = 0; col < yIndex; ++col)
            {
                var v;
                
                if(ranges[col] > 0)
                {
                    v = (record[col] - model.rangesMin[col]) / ranges[col];
                }
                else
                {
                        // Map b to [a, a]? 
                        //  (b - a) / a
                        // for example, map 90 to [100, 100]: (90 - 100) / abs(100) = -0.1,
                        //  map -90 to [-100, -100]: (-90 - (-100)) / abs(-100) = 0.1
                    
                    var ar = Math.abs(model.rangesMin[col]);
                                        
                    if(ar > 0) // i.e., not zero
                    {
                        v = (record[col] - model.rangesMin[col]) / ar;    
                    }    
                    else
                    {
                        // ar === 0, don't modify this value at all
                        
                        v = record[col];
                    }
                }
                
                tabData[tabIndex] = v;
                ++tabIndex;
            }
        }
            // evaluate model with tabData, add values to ensemble output
            
        var anfis = new UnormAnfis(model.xDimension, model.rulesCount);   
        
        anfis.useParameters(model.optimizedParameters);
        anfis.useTabPoints(tabData);
        
        anfis.evauateTabPoints();
        
        for(var row = 0; row < recordsCount; ++row)
        {
            var mo = anfis.currentTabOutput[row];
            
            ensembleOutput[row] += mo;
            
            if(mo > model.ySeparator)
            {
                votes1[row]++;
            }
            else
            {
                votes0[row]++;
            }
        }
    }
    
    ySeparatorAverage /= models.length;
    
        // compare ensemble output with known output
    
    var err0 = 0;
    var err1 = 0;
    
    var votesErr0 = 0;
    var votesErr1 = 0;
    
    var records0 = 0;
    var records1 = 0;
        
    for(var row = 0; row < recordsCount; ++row)
    {
        var eo = (ensembleOutput[row] > ySeparatorAverage) ? 1 : 0;
        
        var ko = collection[row][yIndex];
        
        records0 += (ko < 1) ? 1 : 0;
        records1 += (ko > 0) ? 1 : 0;
        
        if(eo > 0) 
        {
            if(ko < 1)
            {
                ++err0;
            }
        }
        else
        {
            if(ko > 0)
            {
                ++err1;
            }
        }
        
        if(votes1[row] > votes0[row])
        {
            if(ko < 1)
            {
                ++votesErr0;
            }
        }
        else
        {
            if(ko > 0)
            {
                ++votesErr1;
            }
        }
    }
    
    var err = (err0 + err1) / recordsCount;    
    var votesErr = (votesErr0 + votesErr1) / recordsCount;
    
    logInfo('Ensemble test: err0 = ' + err0 + ', err1 = ' + err1 + ', total classifier error ' + err * 100 + '%');
    logInfo('votes err0 = ' + votesErr0 + ', err1 = ' + votesErr1 + ', total votes classifier error ' + votesErr * 100 + '%');
    logInfo('Used ' + records0 + ' [y = 0] and ' + records1 + ' [y = 1] records');
}
//-----------------------------------------------------------------------------
function main(commander)
{
        // to do: move it to global context, in the beginning of the script -
        //  framework would generate it
        
    var parametersBlock = 
    {
        modelsToken : 'int',    // models/<modelsToken>
        testToken : 'int_test', // data/<testToken>
        targetToken: 'int',     // ensembles/<targetToken>
        ensembleSize: 3
    };
    
        // read models folder, get list of items
    getItems(parametersBlock.modelsToken, commander, parametersBlock.ensembleSize, function(itemsRegistry){
        
        if(itemsRegistry)
        {
            logInfo('Downloaded enough items to compose ensemble');
            
            var models = [];
            
            var names = Object.keys(itemsRegistry);
            
            for(var i = 0; i < names.length; ++i)
            {
                models.push(JSON.parse(itemsRegistry[names[i]]));
            }
            
            logInfo(models.length + ' models parsed');
            
            retrieveFullCollection(parametersBlock.testToken, commander, function(collection){
                
                if(collection)
                {
                    logInfo('Test data: ' + collection.length + ' records parsed (' + collection[0].length + ' fields each)');
                }
                
                testEnsemble(collection, models);     
            });
        }
    });
}
//-----------------------------------------------------------------------------
$(document).ready(function(){
    
    $(document.body).append('<div id="rootContainer"></div>');
    $('#rootContainer').css({'overflow' : 'auto', 'height': '100%'});
    $('#rootContainer').append('<div id="info"></div>');

    var socket = io.connect();        
    
    var commander = new AsyncCommander(socket, 'message');
    
    socket.on('connect', function(){
       
        logInfo('*connect'); 
        
        main(commander);
    });
    
    socket.on('disconnect', function(reason){
       
       logInfo('*disconnect: ' + reason); 
    });
    
    socket.on('message', function(message){
        
        if(!commander.hold(message, socket)){
            
                // to do: make special dispatcher for incoming notifications 
                
            logInfo('*unknown reason: ' + message.reason);
        }
    });
});
//-----------------------------------------------------------------------------
