//-----------------------------------------------------------------------------
var lock = false;
//-----------------------------------------------------------------------------
function logInfo(info)
{
    $('#info').append('<p>' + info + '</p>');

    var h = $('#info').height();
    $('#rootContainer').scrollTop(h);
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
function ExperimentData(collection, yAmplitude, ySeparator)
{
    this.collection = collection;
    
    this.yAmplitude = yAmplitude;
    this.ySeparator = ySeparator;
    
    this.rangesMin = [];
    this.rangesMax = [];
    
    this.records0 = 0;
    this.records1 = 0;
        
        //
        
    var recordsCount = collection.length;
    
    var fieldsCount = collection[0].length;

    var yIndex = fieldsCount - 1;
    
    this.tabData = new Float64Array(recordsCount * yIndex);
    this.knownOutput = new Float64Array(recordsCount);
        
        // find fields ranges
            
    var record = collection[0];
    
    var mapped0 = ySeparator - yAmplitude;
    var mapped1 = ySeparator + yAmplitude;

    for(var i = 0; i < yIndex; ++i)
    {
        this.rangesMin[i] = this.rangesMax[i] = record[i];
    }
    
    if(record[yIndex] > 0)
    {
        this.rangesMin[yIndex] = this.rangesMax[yIndex] = mapped1;
        
        this.records1++;    
    }
    else
    {
        this.rangesMin[yIndex] = this.rangesMax[yIndex] = mapped0;
        
        this.records0++;
    }
    
    for(var i = 1; i < recordsCount; ++i)
    {
        record = collection[i];

        for(var j = 0; j < yIndex; ++j)
        {
            var v = record[j];
            
            if(v < this.rangesMin[j])
            {
                this.rangesMin[j] = v;
            }
            
            if(v > this.rangesMax[j])
            {
                this.rangesMax[j] = v;
            }
        }
        
        if(record[yIndex] > 0)
        {
            if(this.rangesMax[yIndex] < mapped1)
            {
                this.rangesMax[yIndex] = mapped1;
            }
            
            this.records1++;    
        }
        else
        {
            if(this.rangesMin[yIndex] > mapped0)
            {
                this.rangesMin[yIndex] = mapped0;
            }
            
            this.records0++;
        }
    }
    
    var ranges = [];
    
    for(var i = 0; i < fieldsCount; ++i)
    {
        ranges[i] = this.rangesMax[i] - this.rangesMin[i];
    }
    
        // normalize data, ectract tab points and known output
    
    var tabIndex = 0;
    
    for(var i = 0; i < recordsCount; ++i)
    {
        record = collection[i];

        for(var j = 0; j < yIndex; ++j)
        {
            if(ranges[j] > 0)
            {
                record[j] = (record[j] - this.rangesMin[j]) / ranges[j];
            }
            else
            {
                record[j] = 0;
            }
            
            this.tabData[tabIndex] = record[j];    
            ++tabIndex;
        }
        
        if(record[yIndex] > 0)
        {
            record[yIndex] = mapped1;
        }
        else
        {
            record[yIndex] = mapped0;
        }
        
        this.knownOutput[i] = record[yIndex];
    }
}
//-----------------------------------------------------------------------------
function workerEntry()
{
////////////////// FOREL clusterization stuff    
function buildClusters(radius, samples, callbackOnNewCluster)
{
    const epsilon = 0.0001;
    
    var samplesCount = samples.length;
    
    var pointDimension = samples[0].length;
    
    var unclusterizedIndexes = [];
    
    for(var i = 0; i < samplesCount; ++i)
    {
        unclusterizedIndexes.push(i);
    }
    
    var clusters = [];
    
        // helpers

    function distance(p1, p2)
    {
        var s = 0;
        
        for(var i = 0; i < pointDimension; ++i)
        {
            var d = (p1[i] - p2[i]);
            
            s += d * d;
        }
        
        return Math.sqrt(s);
    }
    
    function findNeighbours(center)
    {
        var neighbours = [];
        
        var count = unclusterizedIndexes.length;
        
        for(var i = 0; i < count; ++i)
        {
            var testIndex = unclusterizedIndexes[i];
            
            if(distance(center, samples[testIndex]) < radius)   
            {
                neighbours.push(testIndex);
            }
        }
        
        return neighbours;
    }
    
    function excludeFromClusterization(setOfPoints)
    {
        var newCluster = {points:[]};
        
        var newUnclusterized = [];
        
        var unclusterizedCount = unclusterizedIndexes.length;
        var pointsCount = setOfPoints.length;
        
        for(var i = 0; i < unclusterizedCount; ++i)
        {
            var pointIndex = unclusterizedIndexes[i];
            
            var found = -1;
            
            for(var j = 0; j < pointsCount; ++j)
            {
                if(setOfPoints[j] === pointIndex)
                {
                    found = j;
                    break;
                }
            }
            
            if(found < 0)
            {
                newUnclusterized.push(pointIndex);
            }
            else
            {
                newCluster.points.push(pointIndex);
            }
        }
        
        unclusterizedIndexes = newUnclusterized;
        
        return newCluster;
    }
    
    function calcMassCenter(setOfPoints)
    {
        var count = setOfPoints.length;

        var center = [];
        
        var point = samples[setOfPoints[0]];
        
        for(var i = 0; i < pointDimension; ++i)
        {
            center[i] = point[i];
        }
        
        for(var i = 1; i < count; ++i)
        {
            point = samples[setOfPoints[i]];
            
            for(var j = 0; j < pointDimension; ++j)
            {
                center[j] += point[j];    
            }
        }

        for(var i = 0; i < pointDimension; ++i)
        {
            center[i] /= count;
        }
        
        return center;
    }
    
    function selectRandomCenter()
    {
        var center = [];
        
        var randomIndex = Math.floor(Math.random() * unclusterizedIndexes.length);
        
        var pointSelected = samples[unclusterizedIndexes[randomIndex]];
        
        for(var i = 0; i < pointDimension; ++i)
        {
            center[i] = pointSelected[i];    
        }
        
        return center;
    }
        
        // main FOREL
    do 
    {
        var center = selectRandomCenter();
        
        do
        {
            var neighbours = findNeighbours(center);
            var newCenter = calcMassCenter(neighbours);   
            
            var stabilized = (distance(center, newCenter) < epsilon);
            
            center = newCenter;
        }
        while(!stabilized);
    
        var cluster = excludeFromClusterization(neighbours);
        
        cluster.center = center;

        clusters.push(cluster);
        
        if(callbackOnNewCluster)
        {
            callbackOnNewCluster(cluster);
        }
    }
    while(unclusterizedIndexes.length > 0);
    
        // sort clusters by population (biggest first)
    
    clusters.sort(function(a, b){
        return b.points.length - a.points.length;
    });
    
    return clusters;
}
////////////////// end FOREL clusterization stuff    

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

UnormAnfis.prototype.useKnownOutput = function(outputDataArray)
{
        // argument array length must be consistent with current tab points count
        
	this.currentKnownOutput = outputDataArray;
	
	return this;
}

UnormAnfis.prototype.evaluateError = function()
{			
	var e = 0;
	
	var count = this.currentTabPointsCount;
	
	var y1 = this.currentKnownOutput;
	var y2 = this.currentTabOutput;
	
	for(var i = 0; i < count; ++i)
	{		
		var d = y2[i] - y1[i];
		
		e += d * d; 		
	}
	
	this.currentError = e;
	
	return this;
}

UnormAnfis.prototype.evaluateErrfGrad = function(errfGrad)
{
	// this method is used only in optimization (training) procedures 
	
	// argument is plain array of entries corresponding to ANFIS parameters
	//  (its length is rulesCount * ruleEntrySize)
		
	var pointsCount = this.currentTabPointsCount;	
	var rulesCount = this.rulesCount;
	var ruleEntrySize = this.ruleEntrySize;
	var pointDimension = this.pointDimension;
	var modelParameters = this.modelParameters;
	
	var X = this.currentTabPoints;
	var Y = this.currentKnownOutput;
    
	if(this.needRecreateTemps)
	{
		this.products = new Float64Array(pointsCount * rulesCount);
		this.linears = new Float64Array(this.products.length);
		this.errs =  new Float64Array(pointsCount);
				
		this.needRecreateTemps = false;
	}
    
	var products = this.products;
	var linears = this.linears;	
	var errs = this.errs;	
		
	var currentError = 0;
    
        // evaluate temps first,
        // dispatch for [points count x rules count],
        // if 2d layout, rows are for points, cols are for rules
    	
	var point_offset = 0;
	
	var point_rule_offset = 0;

	var q_offset;
	var k_offset;
	var b_offset;
	
	for(var i = 0; i < pointsCount; ++i)
	{			
		var s = 0;		
				
		var rule_offset = 0; 
		
		q_offset = pointDimension;
		k_offset = 2 * pointDimension;
		b_offset = 3 * pointDimension;
	
		for(var r = 0; r < rulesCount; ++r)
		{			
			var muProduct = 0;
			
			var L = modelParameters[b_offset];

			for(var m = 0; m < pointDimension; ++m)
			{
				var arg = X[point_offset + m];

				var a = modelParameters[rule_offset + m];
				var q = modelParameters[q_offset + m];
				
				var t = (arg - a) / q;
								
				muProduct -= t * t;
				
				L += arg * modelParameters[k_offset + m];								
			}	
						
			muProduct = Math.exp(muProduct);
			
			products[point_rule_offset] = muProduct; 
			linears[point_rule_offset] = L;
			
			s += muProduct * L;
			
			rule_offset += ruleEntrySize;
			
			q_offset += ruleEntrySize;
			k_offset += ruleEntrySize;
			b_offset += ruleEntrySize;	
			
			++point_rule_offset;		
		}
	
		var d = s - Y[i];
		
		errs[i] = d;		
		currentError += d * d; 

		point_offset += pointDimension;			
	}
	
	this.currentError = currentError;
    
        // having temps done, evaluate errf grad,
        // dispatch for [rules count x point dimension] 
        // if 2d layout, rows are for rules, cols are for points
	
	rule_offset = 0;
	
	q_offset = pointDimension;
	k_offset = 2 * pointDimension;
	b_offset = 3 * pointDimension;
	
	for(var r = 0; r < rulesCount; ++r)
	{
			// rule entry {{a, q, k}, b}

			// br		
		var sBr = 0;

			// arm, qrm, krm
		for(var m = 0; m < pointDimension; ++m)
		{
			var sArm = 0;
			var sQrm = 0;
			var sKrm = 0;
			
			var sFactorArm;
			var sFactorQrm;
			
			var arm = modelParameters[rule_offset + m];
			var qrm = modelParameters[q_offset + m];
				
			sFactorArm = 4 / (qrm * qrm);
			sFactorQrm = sFactorArm / qrm; 				

			point_offset = 0;
			point_rule_offset = r;
			
			for(var i = 0; i < pointsCount; ++i)
			{
				var xm = X[point_offset + m];
				
				var t2 = xm - arm;
				var t3 = products[point_rule_offset] * errs[i];
				
				var t6 = t2 * t3 * linears[point_rule_offset]; 
				
				sArm += t6; 
				sQrm += t2 * t6;
				
				sKrm += xm * t3;
				
				if(m === 0)
				{
					sBr += t3;	
				}				
									
				point_offset += pointDimension;
				point_rule_offset += rulesCount;
			}																			 	
			
			errfGrad[rule_offset + m] = sFactorArm * sArm;
			errfGrad[q_offset + m] = sFactorQrm * sQrm;	
			errfGrad[k_offset + m] = 2 * sKrm;
		}
							
		errfGrad[b_offset] = 2 * sBr;
		
		rule_offset += ruleEntrySize;
		
		q_offset += ruleEntrySize;
		k_offset += ruleEntrySize;
		b_offset += ruleEntrySize;		
	}
		
	return this;	
}

////////////////// end of Unorm ANFIS model stuff

////////////////// LBFGS optimization stuff   
function trainWithLbfgs(arg, onLbfgsProgressCallback)
{
    ////////////////// LBFGS procedures stuff
    
    function AntigradientLbfgs(problemDimension, historySize)
    {	
    	this.problemDimension = problemDimension;
    	this.historySize = (historySize !== undefined) ? historySize : 10;
        
    		// ping-pong indices 
    	this.ppCurrent = 0;
    	this.ppNext = 1;
    	
    		// history entries
    	this.historyS = [];
    	this.historyY = [];
    	
    	this.historyA = [];
    			
    	this.historyInnerProductsSY = [];
    		
    	for(var i = 0; i < this.historySize; ++i)
    	{
    		this.historyS[i] = new Float64Array(problemDimension);
    		this.historyY[i] = new Float64Array(problemDimension);						
    	}
    		
    		// argument
    	this.X = [];
    	
    	this.X[this.ppNext] = new Float64Array(problemDimension);
    		
    		// goal function value
    	this.f = [];	
    			
    		// gradient
    	this.Grad = [];
    
    	this.Grad[this.ppCurrent] = new Float64Array(problemDimension);
    	this.Grad[this.ppNext] = new Float64Array(problemDimension);
    		
    		//
    	this.p = new Float64Array(problemDimension);
    		
    		//
    	this.epsilon = 0.001;
    	
    	this.reset();
    }
    
    AntigradientLbfgs.prototype.useGradientProvider = function(fillGradient)
    {
    	// fillGradient(vectorX, gradArray), returns f_X
    	
    	this.gradF = fillGradient;
    	
    	return this; 
    }
    
    AntigradientLbfgs.prototype.useInitialArgument = function(initialArray)
    {	
    	this.X[this.ppCurrent] = initialArray;
    			
    	return this;
    }
    
    AntigradientLbfgs.prototype.useEpsilon = function(someSmallEpsilon)
    {
    	this.epsilon = someSmallEpsilon;
    	
    	return this;
    }
    
    AntigradientLbfgs.prototype.innerProduct = function(v1, v2)
    {
    	// returns v1 * v2, inner product, scalar
    	
    	var s = 0;
    
    	var problemDimension = this.problemDimension;
    		
    	for(var i = 0; i < problemDimension; ++i)
    	{
    		s += v1[i] * v2[i];		
    	}	
    	
    	return s;
    }
    
    AntigradientLbfgs.prototype.linearVectorExpression = function(v0, scalar, v1, result)
    {
    	// result = v0 + scalar * v1;
    
    	var problemDimension = this.problemDimension;
    		
    	for(var i = 0; i < problemDimension; ++i)
    	{
    		result[i] = v0[i] + scalar * v1[i];		
    	}	
    	
    	return result;
    } 
    
    AntigradientLbfgs.prototype.scaleVector = function(scalar, v, result)
    {
    	// result = scalar * v;
    
    	var problemDimension = this.problemDimension;
    		
    	for(var i = 0; i < problemDimension; ++i)
    	{
    		result[i] = scalar * v[i];		
    	}	
    	
    	return result;
    } 
    
    AntigradientLbfgs.prototype.vectorDifference = function(v1, v2, result)
    {
    	// result = v1 - v2;
    
    	var problemDimension = this.problemDimension;
    		
    	for(var i = 0; i < problemDimension; ++i)
    	{
    		result[i] = v1[i] - v2[i];		
    	}	
    	
    	return result;
    } 
    
    AntigradientLbfgs.prototype.reset = function()
    {
    	this.firstStep = true;
    	
    	this.diverged = false;
    	this.local = false;
    	this.weird = false;
    	
    	this.stepsDone = 0;
    	
    	return this;
    }
    
    AntigradientLbfgs.prototype.linearSearch = function(maxSteps)
    {
            // Nocedal, Wright, Numerical Optimization, p. 61
            
    	const c1 = 0.0001;
    	const c2 = 0.9;
    	
    	const alphaGrowFactor = 3;
    	
    	var alpha = 1;
    	var alphaLatch = alpha;
    	
    	var steps = 0;
    	
    	var mustReturn = false;
    	
    	var previousStepWasGood = false;
    	
    	var wolfeOk;
    	
    	var fCurrent = this.f[this.ppCurrent];
    	var fNext;
    	var fMin = fCurrent;
    	
    	for(;;)
    	{	
    		this.linearVectorExpression
    		(
    			this.X[this.ppCurrent], 
    			alpha, 
    			this.p, 
    			this.X[this.ppNext]
    		);
    		
    		fNext = this.f[this.ppNext] = this.gradF
    		(
    			this.X[this.ppNext],
    			this.Grad[this.ppNext]
    		);
    		
    		if(mustReturn)
    		{
    			break;
    		}
    		
    		var wolfeTmpProduct = this.innerProduct
    		(
    			this.p, 
    			this.Grad[this.ppCurrent]
    		);
    		
    		var absWolfeTmpProduct = Math.abs(wolfeTmpProduct);
    						
    		var wolfe1 = (fNext <= (fCurrent + c1 * alpha * wolfeTmpProduct));  
    		
    		var absWolfeTmpProductNext = Math.abs
    		(
    			this.innerProduct(this.p, this.Grad[this.ppNext])
    		);
    			
    		var wolfe2 = (absWolfeTmpProductNext <= c2 * absWolfeTmpProduct);
    		
    		wolfeOk = wolfe1 && wolfe2;			
    		
    		++steps;
    
    		if(steps >= maxSteps)
    		{
    			if(wolfeOk)
    			{
    				break;
    			}
    			else
    			{
    				mustReturn = true;
    				
    					// no more steps, just restore good alpha;
    					// cycle will break after grad evaluation
    					
    				if(previousStepWasGood)
    				{
    					alpha = alphaLatch;	
    				}	
    			}										
    		}				
    		else
    		{
    			var alphaFactor = alphaGrowFactor + (-1 + 2 * Math.random());
    			
    			if(wolfeOk)
    			{
    			    break;
    			    /*
    					// store good alpha ...
    				alphaLatch = alpha;
    				
    					// ... and try greater alpha value
    				alpha *= alphaFactor;	
    				
    				previousStepWasGood = true;									
    				*/
    			}
    			else if(!previousStepWasGood)
    			{
    					// use smaller value
    				alpha /= alphaFactor;										
    			}
    			else
    			{
    				mustReturn = true;
    				
    					// f value gone bad, just restore good alpha;
    					// cycle will break after grad evaluation
    				alpha = alphaLatch;	
    				
    				wolfeOk = true;										
    			}						
    		}			
    					
    	} // end for(;;)
    	
    	return wolfeOk;
    }
    
    AntigradientLbfgs.prototype.makeInitialSteps = function(stepsToReport, linearSearchStepsCount)
    {
    	var dimension = this.problemDimension;
    
    	var m = this.historySize;
    	var newestEntryIdex = m - 1;
    	
    	// fill history entries
    	
    	if(this.firstStep)
    	{
    		this.f[this.ppCurrent] = this.gradF
    		(
    			this.X[this.ppCurrent],
    			this.Grad[this.ppCurrent]			
    		);	
    		
    		this.firstStep = false;
    	}

    	for(var i = 0; i < m; ++i)
    	{
    	    this.stepsDone++;
    	    
    		for(var j = 0; j < dimension; ++j)
    		{
    			this.p[j] = -this.Grad[this.ppCurrent][j];
    		}

    		this.linearSearch(linearSearchStepsCount);	
            
            //*
    		if(isNaN(this.f[this.ppNext]))
    		{
    			this.weird = true;
    		}
    		
    		if(this.f[this.ppCurrent] < this.f[this.ppNext])
    		{
    			this.diverged = true;
    		}
    		
    		if(this.weird || this.diverged)
    		{
    				// reset model to good point
    			this.gradF
    			(
    				this.X[this.ppCurrent],
    				this.Grad[this.ppCurrent]			
    			);		
    			
    			break;
    		}		
            
    		if(Math.abs(this.f[this.ppCurrent] - this.f[this.ppNext]) < this.epsilon)
    		{
    			this.local = true;
    			break;
    		}		
            //*/
    			//
    		this.vectorDifference
    		(
    			this.X[this.ppNext], 
    			this.X[this.ppCurrent], 
    			this.historyS[i]
    		);			 
    
    		this.vectorDifference
    		(
    			this.Grad[this.ppNext], 
    			this.Grad[this.ppCurrent], 
    			this.historyY[i]
    		);	
    		
    			//
    		this.historyInnerProductsSY[i] = this.innerProduct
    		(
    			this.historyS[i], 
    			this.historyY[i]
    		);		 
    
    		if(i === newestEntryIdex)
    		{
    			var denominator = this.innerProduct
    			(
    				this.historyY[i], 
    				this.historyY[i]
    			);		 
    			
    			this.previousStepInnerProductsSYYY = this.historyInnerProductsSY[i] / denominator;	
    		}
    			
    			// report, if needed		
    		var reportedStep = i + 1;
    			
    		if(reportedStep % stepsToReport === 1)
    		{
    			this.reportProgress("lbfgs init", reportedStep, this.f[this.ppNext]);
    		}							
    			
    			// swap ping-pong indices
    		this.ppCurrent = 1 - this.ppCurrent;
    		this.ppNext = 1 - this.ppNext; 
    	}
    	
    	return this;
    }
    
    AntigradientLbfgs.prototype.lbfgsTwoLoops = function()
    {
    	var dimension = this.problemDimension;
    	var m = this.historySize;
    	
    	// calcs new direction p
    	
    	for(var i = 0; i < dimension; ++i)
    	{
    		this.p[i] = -this.Grad[this.ppCurrent][i];
    	}
    	
    		// from current to past
    	for(var i = m - 1; i >= 0; --i)
    	{
    		var numerator = this.innerProduct
    		(
    			this.historyS[i], 
    			this.p
    		);
    		
    		var a = this.historyA[i] = numerator / this.historyInnerProductsSY[i];
    		
    		this.linearVectorExpression
    		(
    			this.p,
    			-a,
    			this.historyY[i],
    			this.p 
    		);		
    	}
    		
    	this.scaleVector(this.previousStepInnerProductsSYYY, this.p, this.p);
    	
    		// from past to current
    	for(var i = 0; i < m; ++i)
    	{
    		var numerator = this.innerProduct
    		(
    			this.historyY[i], 
    			this.p
    		);
    
    		var b = numerator / this.historyInnerProductsSY[i];
    
    		this.linearVectorExpression
    		(
    			this.p,
    			this.historyA[i] - b,
    			this.historyS[i],
    			this.p 
    		);				
    	}
    	
    	return this;
    }

    AntigradientLbfgs.prototype.makeStepsLbfgs = function
    	(
    		stepsToReport,
    		stepsCount, 
    		linearSearchStepsCount
    	)
    {
    	var m = this.historySize;	
    	
    	this.makeInitialSteps(stepsToReport, linearSearchStepsCount);
    	
    	if(this.weird || this.diverged || this.local)
    	{
    		return this.X[this.ppCurrent];
    	}	
    	
    	for(var step = 0; step < stepsCount; ++step)
    	{
    	    this.stepsDone++;
    	    
    			// do L-BFGS stuff
    		this.lbfgsTwoLoops();
    			
    			//
    		this.linearSearch(linearSearchStepsCount);	
    		
    		//*
    		if(isNaN(this.f[this.ppNext]))
    		{
    			this.weird = true;
    		}
    		
    		if(this.f[this.ppCurrent] < this.f[this.ppNext])
    		{
    			this.diverged = true;			
    		}
    		
    		if(this.weird || this.diverged)
    		{
    				// reset model to good point
    			this.gradF
    			(
    				this.X[this.ppCurrent],
    				this.Grad[this.ppCurrent]			
    			);		
    			
    			break;
    		}		
            
    		if(Math.abs(this.f[this.ppCurrent] - this.f[this.ppNext]) < this.epsilon)
    		{
    			this.local = true;
    			break;
    		}		
    		//*/
    			// forget the oldest history entry, shift from past to current			
    				
    		var oldestS = this.historyS[0];
    		var oldestY = this.historyY[0];
    		
    		var newestEntryIdex = m - 1;
    		
    		for(var i = 0; i < newestEntryIdex; ++i)
    		{
    			var next = i + 1;
    			
    				// (we only re-assign pointers to arrays)
    			this.historyS[i] = this.historyS[next];
    			this.historyY[i] = this.historyY[next];
    			 
    			this.historyA[i] = this.historyA[next];
    			this.historyInnerProductsSY[i] = this.historyInnerProductsSY[next];
    		}	
    		
    			// (we only re-assign pointers to arrays)
    		this.historyS[newestEntryIdex] = oldestS;
    		this.historyY[newestEntryIdex] = oldestY; 
    		
    			// update newest stuff
    			
    		this.vectorDifference
    		(
    			this.X[this.ppNext], 
    			this.X[this.ppCurrent], 
    			this.historyS[newestEntryIdex]
    		);			 
    
    		this.vectorDifference
    		(
    			this.Grad[this.ppNext], 
    			this.Grad[this.ppCurrent], 
    			this.historyY[newestEntryIdex]
    		);	
    		
    			//
    		this.historyInnerProductsSY[newestEntryIdex] = this.innerProduct
    		(
    			this.historyS[newestEntryIdex], 
    			this.historyY[newestEntryIdex]
    		);		 
    
    		var denominator = this.innerProduct
    		(
    			this.historyY[newestEntryIdex], 
    			this.historyY[newestEntryIdex]
    		);		 
    
    		this.previousStepInnerProductsSYYY = this.historyInnerProductsSY[newestEntryIdex] / denominator;	 			
    			
    			// swap ping-pong indices
    		this.ppCurrent = 1 - this.ppCurrent;
    		this.ppNext = 1 - this.ppNext; 
    		
    			// report, if needed		
    		var reportedStep = step + 1;
    			
    		if(reportedStep % stepsToReport === 1)
    		{
    			this.reportProgress("lbfgs", reportedStep, this.f[this.ppCurrent]);
    		}							
    	}
    		
    	return this.X[this.ppCurrent];
    }

    AntigradientLbfgs.prototype.useOnProgress = function(callbackProgress)
    {
    	this.callbackProgress = callbackProgress;
    	
    	return this;
    }

    AntigradientLbfgs.prototype.reportProgress = function(phase, step, fCurrent)
    {
    	if(this.callbackProgress !== undefined)
    	{
    		this.callbackProgress(phase, step, fCurrent);
    	}
    	
    	return this;	
    }
    
    //////////////////  end of LBFGS procedures stuff
    
        // do optimization procedures
        
    var anfis = new UnormAnfis(arg.pointDimension, arg.anfisRulesCount);
    
    anfis.useParameters(arg.anfisParameters);
    anfis.useTabPoints(arg.tabPoints);
    anfis.useKnownOutput(arg.knownOutput);
    anfis.evauateTabPoints();
    anfis.evaluateError();
    
    var initialError = anfis.currentError;

    var lbfgs = new AntigradientLbfgs(arg.anfisParameters.length, arg.lbfgsHistorySize);
    
    lbfgs.useInitialArgument(arg.anfisParameters);
    
    lbfgs.useGradientProvider(function(vectorX, gradArray){
        
        anfis.useParameters(vectorX);  
        
        anfis.evaluateErrfGrad(gradArray);
        
        return anfis.currentError;
    });
    
    lbfgs.useEpsilon(arg.epsilon);
    
    lbfgs.useOnProgress(onLbfgsProgressCallback);
        
    lbfgs.reset();
    
    var optX = lbfgs.makeStepsLbfgs(arg.reportSteps, arg.lbfgsSteps, arg.linearSearchStepsCount);
    
    return {
        optX: optX, 
        weird: lbfgs.weird, 
        diverged: lbfgs.diverged, 
        local: lbfgs.local, 
        error: anfis.currentError, 
        stepsDone: lbfgs.stepsDone, 
        initialError: initialError
    };
}
////////////////// end LBFGS optimization stuff   

    onmessage = function(e)
    {
        var arg = e.data;
        
        if(arg.proc === 'clusterize')
        {
            postMessage({clusters: buildClusters(arg.radius, arg.samples)}); 
        }
        else if(arg.proc === 'optimize')
        {
            var timeStart = Date.now();
            
            var lbfgsStatus = trainWithLbfgs(arg, function(phase, step, fCurrent){
                
                postMessage({lbfgsFeedback: {phase: phase, step: step, fCurrent: fCurrent}});
            });
            
            var timeWorked = Date.now() - timeStart;
            
            postMessage
            ({
                lbfgsFeedback: 
                {
                    done: true, 
                    optX: lbfgsStatus.optX, 
                    weird: lbfgsStatus.weird, 
                    diverged: lbfgsStatus.diverged, 
                    local: lbfgsStatus.local, 
                    error: lbfgsStatus.error, 
                    stepsDone: lbfgsStatus.stepsDone, 
                    initialError: lbfgsStatus.initialError,
                    timeWorked: timeWorked
                }
            });
        }
        else if(arg.proc === 'test')
        {
            var anfis = new UnormAnfis(arg.pointDimension, arg.anfisRulesCount);
            
            anfis.useParameters(arg.anfisParameters);
            anfis.useTabPoints(arg.tabPoints);
            anfis.evauateTabPoints();

            postMessage({test: anfis.currentTabOutput});
        }
    }
}
//-----------------------------------------------------------------------------
function initializeModel(taskContext, clusters)
{
    var yIndex = taskContext.trainData.collection[0].length - 1;     
    
    var model = 
    {
        trainToken: taskContext.structureParameters.trainToken,
        xDimension: yIndex,
        rulesCount: (taskContext.structureParameters.anfisRulesCount ? taskContext.structureParameters.anfisRulesCount : clusters.length),
        yAmplitude: taskContext.structureParameters.yAmplitude,
        ySeparator: taskContext.structureParameters.ySeparator,
        rangesMin: taskContext.trainData.rangesMin,
        rangesMax: taskContext.trainData.rangesMax,
        parameters: []
    };
    
        // initialize model parameters
        // a - cluster center, q - qFactor * radius, b = 0, l0 = average y for points in cluster
        
    var parameterIndex = 0;
    
    var parameters = model.parameters;
    
    var initRandom = taskContext.structureParameters.initRandom;
    
    for(var r = 0; r < model.rulesCount; ++r)
    {
        var cluster = clusters[r % clusters.length];
            
            // a
        for(var col = 0; col < yIndex; ++col)
        {
            parameters[parameterIndex] = (initRandom ? Math.random() : cluster.center[col]);
            ++parameterIndex;                    
        }
            // q
        //var q = qFactor * radius;
        var q = taskContext.structureParameters.qFactor;
        
        for(var col = 0; col < yIndex; ++col)
        {
            parameters[parameterIndex] = (initRandom ? (-1 + 2 * Math.random()) * 0.1 + q : q);
            ++parameterIndex;                    
        }
            // b
        for(var col = 0; col < yIndex; ++col)
        {
            parameters[parameterIndex] = (initRandom ? (-1 + 2 * Math.random()) : 0);
            ++parameterIndex;                    
        }
            // linear 0
            // y center for this cluster    

        parameters[parameterIndex] = (initRandom ? (-1 + 2 * Math.random()) : cluster.center[yIndex]);
        ++parameterIndex;
    }
    
    return model;
}
//-----------------------------------------------------------------------------
function trainModel(taskContext)
{
    taskContext.worker.postMessage
    ({
        proc: 'optimize',
        pointDimension: taskContext.model.xDimension,
        anfisRulesCount: taskContext.model.rulesCount, 
        anfisParameters: taskContext.model.parameters,
        tabPoints: taskContext.trainData.tabData, 
        knownOutput: taskContext.trainData.knownOutput,
        lbfgsHistorySize: taskContext.structureParameters.lbfgsHistorySize,
        lbfgsSteps: taskContext.structureParameters.lbfgsSteps,
        linearSearchStepsCount: taskContext.structureParameters.linearSearchStepsCount,
        epsilon: 1e-8,
        reportSteps: 20
    });    
}
//-----------------------------------------------------------------------------
function prepareTestData(collection, model)
{
    var recordsCount = collection.length;
    var fieldsCount = collection[0].length;
    var yIndex = fieldsCount - 1;
        
        //
        
    var testData = 
    {
        records0: 0,
        records1: 0,
        tabData: new Float64Array(recordsCount * yIndex),
        knownOutput: new Float64Array(recordsCount)
    };

    var mapped0 = model.ySeparator - model.yAmplitude;
    var mapped1 = model.ySeparator + model.yAmplitude;
    
    var ranges = [];
    
    for(var i = 0; i < fieldsCount; ++i)
    {
        ranges[i] = model.rangesMax[i] - model.rangesMin[i];
    }
    
        // map data to model ranges, ectract tab points and known output
    
    var tabIndex = 0;
    
    for(var i = 0; i < recordsCount; ++i)
    {
        var record = collection[i];

        for(var j = 0; j < yIndex; ++j)
        {
            if(ranges[j] > 0)
            {
                record[j] = (record[j] - model.rangesMin[j]) / ranges[j];
            }
            else
            {
                    // Map b to [a, a]? 
                    //  (b - a) / a
                    // for example, map 90 to [100, 100]: (90 - 100) / abs(100) = -0.1,
                    //  map -90 to [-100, -100]: (-90 - (-100)) / abs(-100) = 0.1
                
                var ar = Math.abs(model.rangesMin[j]);
                                    
                if(ar > 0) // i.e., not zero
                {
                    record[j] = (record[j] - model.rangesMin[j]) / ar;    
                }    
                    // else ar === 0, don't modify this value at all
            }
            
            testData.tabData[tabIndex] = record[j];    
            ++tabIndex;
        }
        
        if(record[yIndex] > 0)
        {
            record[yIndex] = mapped1;
            
            testData.records1++;
        }
        else
        {
            record[yIndex] = mapped0;
            
            testData.records0++;
        }
        
        testData.knownOutput[i] = record[yIndex];
    }
    
    return testData;
}
//-----------------------------------------------------------------------------
function testModel(taskContext)
{
    taskContext.worker.postMessage
    ({
        proc: 'test', 
        pointDimension: taskContext.model.xDimension,
        anfisRulesCount: taskContext.model.rulesCount,
        anfisParameters: taskContext.model.optimizedParameters,
        tabPoints: taskContext.testData.tabData
    });
}
//-----------------------------------------------------------------------------
function checkBest(taskContext)
{
    var pathBest = 'best/' + taskContext.structureParameters.bestToken;
    
    taskContext.commander.issueCommand('YAD_LIST_ELEMENTS', [pathBest, ['_embedded.items.name', '_embedded.total', "name"], 1, 0], function(context){
        
        if(context.message.yadTransaction && !context.message.yadTransaction.error)
        {
            var responseObject = JSON.parse(context.message.yadTransaction.response);
            
            if(responseObject._embedded && (responseObject._embedded.total > 0))
            {
                var pathBestModel = pathBest + '/' + responseObject._embedded.items[0].name;
                
                context.commander.issueCommand('YAD_READ_FILE', [pathBestModel, false], function(ctx){

                    if(ctx.message.yadTransaction && !ctx.message.yadTransaction.error)
                    {
                        var bestModel = JSON.parse(ctx.message.yadTransaction.response);
                        
                        logInfo('Best model err: ' + bestModel.classifierError);
                        logInfo('Current model err: ' + taskContext.model.classifierError);
                        
                        if(bestModel.classifierError > taskContext.model.classifierError)
                        {
                            logInfo('Replacing best model');    
                            
                            ctx.commander.issueCommand('YAD_OVEWRITE_FILE', [pathBestModel, false, taskContext.modelStr], function(ctx1){
                                
                                if(ctx1.message.yadTransaction && !ctx1.message.yadTransaction.error)
                                {
                                    logInfo('Possibly stored as best model');    
                                }
                                else
                                {
                                    logInfo('Failed to replace best model');
                                }
                                
                                logInfo('All done. Stopped.');
                            });
                        }
                        else
                        {
                            logInfo('No need to replace best model');
                            logInfo('All done. Stopped.');
                        }
                    }
                    else
                    {
                        logInfo('All done. Stopped.');    
                    }
                });
            }
            else
            {
                // store this model, it is good enough to be first best
                
                context.commander.issueCommand('YAD_WRITE_FILE', [pathBest + '/best-' + taskContext.structureParameters.bestToken + '.json', false, taskContext.modelStr], function(ctx){
                    
                    if(ctx.message.yadTransaction && !ctx.message.yadTransaction.error)
                    {
                        logInfo('Possibly stored as best model');
                    }
                    
                    logInfo('All done. Stopped.');
                });
            }
        }
    });
}
//-----------------------------------------------------------------------------
function onWorkerMessage(e)
{
    var arg = e.data;
    
    if(arg.clusters)
    {
        var clustersCount = arg.clusters.length;
        
        logInfo('Found ' + clustersCount + ' clusters; the biggest contains ' + arg.clusters[0].points.length + ' points');
        
        var s = '';
        
        for(var i = 0; i < clustersCount; ++i)
        {
            s += arg.clusters[i].points.length + ', ';
        }
        
        logInfo(s);
        
        this.model = initializeModel(this, arg.clusters);
        
        if(this.structureParameters.initRandom)
        {
            logInfo('Initializing with random parameters');
        }
        
        logInfo('Initialized ' + this.model.parameters.length + ' ANFIS parameters (' + this.model.rulesCount + ' rules, X dimension = ' + this.model.xDimension + ')');
        
        trainModel(this);
    }
    else if(arg.lbfgsFeedback)
    {
        var lbfgsStatus = arg.lbfgsFeedback;
        
        if(lbfgsStatus.done)
        {
            logInfo('Optimization done in ' + (lbfgsStatus.timeWorked/1000) + ' sec (' + lbfgsStatus.stepsDone + ' steps)');
            logInfo('{weird: ' + lbfgsStatus.weird + ', diverged: ' + lbfgsStatus.diverged + ', local: ' + lbfgsStatus.local + '}');
            logInfo('f optimized: ' + lbfgsStatus.error + ', f initial: ' + lbfgsStatus.initialError);
            
            if(lbfgsStatus.weird || lbfgsStatus.diverged || lbfgsStatus.local)
            {
                logInfo('Model seems to fail training with the specified parameters. Stopped');            
            }
            else
            {
                this.model.optimizedParameters = lbfgsStatus.optX;
                    
                    // now retrieve test data
                    
                retrieveFullCollection(this.structureParameters.testToken, this.commander, function(collection){
                    
                    if(collection)
                    {
                        logInfo('Test data: ' + collection.length + ' records parsed (' + collection[0].length + ' fields each)');    
                        
                        this.testData = prepareTestData(collection, this.model);
                        
                        logInfo('records [y = 0]: ' + this.testData.records0 + ', records [y = 1]: ' + this.testData.records1);
                        
                        testModel(this);
                    }        
                }.bind(this));
            }
        }
        else
        {
            logInfo('phase: ' + lbfgsStatus.phase + ', step: ' + lbfgsStatus.step + ', f: ' + lbfgsStatus.fCurrent);
        }
    }
    else if(arg.test)
    {
        var mo = arg.test;
        var count = mo.length;
        
        var ko = this.testData.knownOutput;
        
        var separator = this.model.ySeparator;
                
        var err0 = 0;
        var err1 = 0;

        for(var i = 0; i < count; ++i)
        {
            if(mo[i] > separator)
            {
                if(ko[i] < separator)
                {
                    ++err0;
                }
            }
            else
            {
                if(ko[i] > separator)
                {
                    ++err1;
                }
            }
        }
        
        var err = (err0 + err1) / count;
        
        logInfo('Test result: err0 = ' + err0 + ', err1 = ' + err1 + ', total classifier error ' + err * 100 + '%');
        
        this.model.testToken = this.structureParameters.testToken;
        
            // trim long numbers to reasonable precision
            
        const decimalPlaces = 6;
        
        this.model.classifierError0 = decimalRound(err0 / count, decimalPlaces);
        this.model.classifierError1 = decimalRound(err1 / count, decimalPlaces);
        this.model.classifierError = decimalRound(err, decimalPlaces);
        
        var parametersCount = this.model.parameters.length;
        
        for(var i = 0; i < parametersCount; ++i)
        {
            this.model.parameters[i] = decimalRound(this.model.parameters[i], decimalPlaces);
            this.model.optimizedParameters[i] = decimalRound(this.model.optimizedParameters[i], decimalPlaces);
        }
            
            // store model
        
        this.model.targetToken = this.structureParameters.targetToken;
        
        this.modelStr = JSON.stringify(this.model);
        var modelName = generateUniqueKey() + '.json';
        
        var path = 'models/' + this.structureParameters.targetToken + '/' + modelName;
        
        this.commander.issueCommand('YAD_WRITE_FILE', [path, false, this.modelStr], function(ctx){
            
            if(ctx.message.yadTransaction && !ctx.message.yadTransaction.error)
            {
                logInfo('Possibly stored: ' + path);
            }
            
            if(this.model.classifierError < this.structureParameters.goodThreshold)
            {
                var pathGood = 'good/' + this.structureParameters.goodToken + '/' + modelName;
            
                this.commander.issueCommand('YAD_WRITE_FILE', [pathGood, false, this.modelStr], function(ctx1){

                    if(ctx1.message.yadTransaction && !ctx1.message.yadTransaction.error)
                    {
                        logInfo('Possibly stored to good models: ' + pathGood);
                        
                        checkBest(this);        
                    }
                    else
                    {
                        logInfo('Failed to store to good models. Stopped.')
                    }
                }.bind(this));
            }
            else
            {
                logInfo('All done. Stopped.');
            }
            
        }.bind(this));
    }
}
//-----------------------------------------------------------------------------
function main(commander)
{
        // to do: move it to global context, in the beginning of the script -
        //  framework would generate it
        
    var parametersBlock = 
    {
        trainToken : 'int_train',       // data/<trainToken>
        testToken : 'int_test',         // data/<testToken>
        targetToken: 'int_ar-debug',          // models/<targetToken>
        goodToken: 'int_debug',               // good/<goodToken>
        bestToken: 'int_debug',               // best/<bestToken>
        goodThreshold: 0.22,
        initRandom: false,
        clusterizationRadius : 2.2,
        qFactor : 4,
        yAmplitude : 2,
        ySeparator : 0,
        anfisRulesCount: 5,
        lbfgsHistorySize: 10,
        lbfgsLinearSearchStepsCount: 20,
        lbfgsSteps: 1000
    };

    retrieveFullCollection(parametersBlock.trainToken, commander, function(collection){
        
        if(collection)
        {
            logInfo('Train data: ' + collection.length + ' records parsed (' + collection[0].length + ' fields each)');    
            
            var ed = new ExperimentData(collection, parametersBlock.yAmplitude, parametersBlock.ySeparator);
            
            logInfo('records [y = 0]: ' + ed.records0 + ', records [y = 1]: ' + ed.records1);
            
            var workerUrl = URL.createObjectURL(new Blob(["(" + workerEntry.toString() + ")()"], {type: "application/javascript"}));        
            
            var worker = new Worker(workerUrl);
            
            URL.revokeObjectURL(workerUrl);
            
            worker.onmessage = onWorkerMessage.bind
            ({
                structureParameters: parametersBlock, 
                trainData: ed,
                worker: worker,
                commander: commander
            });

            worker.postMessage
            ({
                proc: 'clusterize', 
                radius: parametersBlock.clusterizationRadius,
                samples: ed.collection
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
        
        if(!lock)
        {
            lock = true;
            
            main(commander);
        }
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
