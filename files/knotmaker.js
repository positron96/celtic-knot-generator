/**
 * This file handles knot rendering and the cut editor UI. It also
 * provides a simple API for setting knot size, colors and so on.
 *
 * Copyright (c) 2012 Janis Elsts, whiteshadow@w-shadow.com
 */

var KnotMaker = (function($) {
	/**
	 * Settings
	 */
	var settings = {
		//Knot dimensions
		rows : 12,
		columns : 12,

		//Cosmetic settings
		cellSize : 53,
		stringSize : 22,
		strokeWidth : 2,
		stringColor : "#FF9A39",
		strokeColor : "#000000",
		backgroundColor: "#FFFFFF",

		//Pattern editor UI colors
		gridColor: "rgb(180, 180, 180)",
		cutColor: "red",//"rgb(180, 180, 180)",
		newCutColor: "rgb(0, 255, 0)",
		controlNodeColor1: "#6dcff6",
		controlNodeColor2: "#f66d6d",

		showGrid: true,
		showUi: true, //Setting this to false also hides the grid.

		controlNodeSize : 5,
		selectedControlNodeSize : 12,

		halfCellSize : null,
		halfStringSize : null
	};
	settings.halfCellSize = settings.cellSize / 2;
	settings.halfStringSize = settings.stringSize / 2;

	/**
	 * Canvas handles.
	 */
	var canvas = null;
	var context = null;
	var style = null;

	/*
	 * Custom origin point for rendering. Useful since some
	 * UI elements can extend outside the primary work area.
	 */
	var outputOffset = {x : 10, y : 10};

	/**
	 * The knotwork pattern is defined by an array of cuts.
	 */
	var NO_CUT = 0;
	var HORIZ_CUT = 1;
	var VERT_CUT = 2;
	function cutToStr(cut) { return cut==NO_CUT?'-':cut==HORIZ_CUT?'H':'V';}

	var cuts = [];

	var cutRows = null;     //The number of rows of cuts. Calculated from the knotwork size.
	var cutColumns = null;  //The number of cuts per row.

	/**
	 * Row/column parity constants. Used in rendering.
	 */
	var ODD = 1;
	var EVEN = 0;

	/**
	 * UI state.
	 */
	var selectedNode = null;
	var hoverNode = null;

	var PathBuilder = function() {
		return {
			arr: Array(),
			beginPath: function(){ this.arr = []; },
			moveTo: function(x,y){ this.arr.push('M '+x+','+y); },
			lineTo: function(x,y){ this.arr.push('L '+x+','+y); },
			bezierCurveTo: function(cx1,cy1,cx2,cy2, x,y) {this.arr.push('C '+cx1+','+cy1+','+cx2+','+cy2+','+x+','+y); }, 
			quadraticCurveTo: function(cx1,cy1,x,y) {this.arr.push('Q '+cx1+','+cy1+','+x+','+y); }, 
			closePath: function(x,y){this.arr.push('Z') },
			gen: function() { return this.arr.join(' '); },
			stroke: function(ctx, col) { 
				return ctx.path(this.gen()).
					attr('class', col || 'knotlines');
			},
			fill: function(ctx, col) { 
				return ctx.path(this.gen()).
					attr('class', col || 'knotfill');
			}
		}
	};

	/*
	 * The state of each knotwork cell is fully determined by the two closest cuts
	 * and by the parity of the row/column that it's located on (i.e. odd vs even).
	 *
	 * There are cut1 x cut2 x row-parity x col-parity = 36 total states.
	 * Each state corresponds to a particular tile (e.g. corner, curved diagonal
	 * crossing, etc). Most of these can be obtained by rotating or mirroring
	 * one of a small set of base tiles.
	 *
	 * We start by defining how to draw these base tiles (drawXXX()), then
	 * proceed to build a four-dimensional state matrix of tile drawing functions.
	 */
	var drawFuncs = (function() {
		function drawHorizontalLine(context, settings) {
			context.rect(
				settings.cellSize,
				settings.stringSize
			).move(0,settings.halfCellSize - settings.halfStringSize).attr('class', 'knotfill');

			pb = PathBuilder();
			pb.moveTo(0, settings.halfCellSize - settings.halfStringSize);
			pb.lineTo(settings.cellSize, settings.halfCellSize - settings.halfStringSize);
			pb.moveTo(0, settings.halfCellSize + settings.halfStringSize);
			pb.lineTo(settings.cellSize, settings.halfCellSize + settings.halfStringSize);
			pb.stroke(context);
		}

		/**
		 * Draw a diagonal strand (bottom-left to top-right) crossing
		 * another at the corner.
		 *
		 * @param context
		 * @param settings
		 */
		function drawStraightCross(context, settings) {
			var h = Math.round(settings.stringSize / Math.sqrt(2));

			pb = PathBuilder();
			pb.moveTo(0, settings.cellSize);
			pb.lineTo(0, settings.cellSize - h);
			pb.lineTo(settings.cellSize - h, 0);
			pb.lineTo(settings.cellSize, 0);
			pb.lineTo(settings.cellSize, h);
			pb.lineTo(h, settings.cellSize);
			pb.closePath();
			pb.fill(context, 'aa').fill('url(#grad)');

			pb.beginPath();
			pb.moveTo(settings.cellSize - h, 0);
			pb.lineTo(settings.cellSize, 0);
			pb.lineTo(settings.cellSize, h);
			pb.closePath();
			pb.fill(context);

			pb.beginPath();
			pb.moveTo(0, settings.cellSize - h);
			pb.lineTo(settings.cellSize - h, 0);
			pb.moveTo(h, settings.cellSize);
			pb.lineTo(settings.cellSize, h);
			pb.lineTo(settings.cellSize - h, 0);
			pb.stroke(context);

		}

		/**
		 * Draw a corner pointing to bottom right.
		 *
		 * @param context
		 * @param settings
		 */
		function drawCorner(context, settings) {

			pb = PathBuilder();
			pb.moveTo(settings.halfCellSize - settings.halfStringSize, 0);
			pb.lineTo(settings.halfCellSize + settings.halfStringSize, 0);

			pb.quadraticCurveTo(
				settings.halfCellSize + settings.halfStringSize,
				settings.halfCellSize + settings.halfStringSize,
				0,
				settings.halfCellSize + settings.halfStringSize
			);
			pb.lineTo(0, settings.halfCellSize - settings.halfStringSize);

			pb.quadraticCurveTo(
				settings.halfCellSize - settings.halfStringSize,
				settings.halfCellSize - settings.halfStringSize,
				settings.halfCellSize - settings.halfStringSize,
				0
			);
			pb.closePath();
			pb.fill(context);


			pb.beginPath();
			//Outer curve
			pb.moveTo(settings.halfCellSize + settings.halfStringSize, 0);
			pb.quadraticCurveTo(
				settings.halfCellSize + settings.halfStringSize,
				settings.halfCellSize + settings.halfStringSize,
				0,
				settings.halfCellSize + settings.halfStringSize
			);

			//Inner curve
			pb.moveTo(0, settings.halfCellSize - settings.halfStringSize);
			pb.quadraticCurveTo(
				settings.halfCellSize - settings.halfStringSize,
				settings.halfCellSize - settings.halfStringSize,
				settings.halfCellSize - settings.halfStringSize,
				0
			);
			pb.stroke(context);
		}

		/**
		 * Draw a vertical strand curved to the right at the top, crossing another.
		 *
		 * @param context
		 * @param settings
		 * @param crossOver Whether to cross over or under the other strand. Defaults to true.
		 */
		function drawCurvedCross(context, settings, crossOver) {
			crossOver = (typeof crossOver == "undefined") ? true : crossOver;

			var h = Math.round(settings.stringSize / Math.sqrt(2));
			var topCpLength = 2;

			function leftSideCurve(pb) {
				pb.bezierCurveTo(
					//control point 1
					settings.halfCellSize - settings.halfStringSize,
					settings.halfCellSize - h * 0.4,

					//control point 2
					(settings.cellSize - h) - topCpLength,
					topCpLength,

					//endpoint
					settings.cellSize - h,
					0
				);
			}

			function rightSideCurve(pb) {
				pb.bezierCurveTo(
					//control point 1
					settings.cellSize - topCpLength,
					h + topCpLength,

					//control point 2
					settings.halfCellSize + settings.halfStringSize,
					settings.halfCellSize + h * 0.4,

					//endpoint
					settings.halfCellSize + settings.halfStringSize,
					settings.cellSize
				);
			}

			pb = PathBuilder();
			pb.moveTo(settings.halfCellSize - settings.halfStringSize, settings.cellSize);
			leftSideCurve(pb);
			pb.lineTo(settings.cellSize, 0);
			pb.lineTo(settings.cellSize, h);
			rightSideCurve(pb);
			pb.closePath();
			var area = pb.fill(context, 'aaa');
			if(!crossOver) { 
				area.fill('url(#gradrot)'); 
				pb.beginPath();
				pb.moveTo(settings.cellSize - h, 0);
				pb.lineTo(settings.cellSize, 0);
				pb.lineTo(settings.cellSize, h);
				pb.closePath();
				pb.fill(context);
			} else area.attr('class', 'knotfill');

			//Stroke the outline
			pb.beginPath();		
			pb.moveTo(settings.halfCellSize - settings.halfStringSize, settings.cellSize);
			leftSideCurve(pb);
			if ( crossOver ) {
				pb.moveTo(settings.cellSize, h);
			} else {
				pb.lineTo(settings.cellSize, h);
			}
			rightSideCurve(pb);
			pb.stroke(context);

		}

		function drawCurvedCrossUnder(context, settings) {
			return drawCurvedCross(context, settings, false);
		}

		/**
		 * Rotate the output of a tile drawing function around the center of the cell (clockwise).
		 *
		 * @param drawFunction
		 * @param degrees
		 */
		function rotate(drawFunction, degrees) {
			return function(context, settings) {
				//context.fillStyle = {90:'red',180:'green',270:'blue'}[degrees];
				//context.rotate(degrees, settings.cellSize/2, settings.cellSize/2);
				g = context.group();
				g.fillStyle = context.fillStyle;
				g.strokeStyle = context.strokeStyle;
				g.lineWidth = context.lineWidth;
				g.attr('transform', 'rotate('+degrees+' '+settings.cellSize/2+' '+settings.cellSize/2+')')
				drawFunction(g, settings);
			};
		}

		/**
		 * Mirror the output of a tile drawing function horizontally around the middle of the cell.
		 *
		 * @param drawFunction
		 */
		function flipHorizontally(drawFunction) {
			return function(context, settings) {
				g = context.group();
				g.fillStyle = context.fillStyle;
				g.strokeStyle = context.strokeStyle;
				g.lineWidth = context.lineWidth;
				g.attr('transform', "scale(-1 1) translate("+(-settings.cellSize)+" 0)");
				drawFunction(g, settings);
			}
		}

		/**
		 * Draw a red crossed-out square. Used for debugging.
		 *
		 * @param context
		 * @param settings
		 */
		function drawError(context, settings) {
			context.fillStyle = "rgb(255, 0, 0)";
			context.fillRect(0, 0, settings.cellSize, settings.cellSize);
			context.strokeStyle = "rgb(0, 0, 0)";
			context.lineWidth = 2;
			context.strokeRect(0, 0, settings.cellSize, settings.cellSize);

			var offset = Math.round(settings.halfCellSize * 0.25 + 1);
			context.beginPath();
			context.moveTo(offset, offset);
			context.lineTo(settings.cellSize - offset, settings.cellSize - offset);
			context.moveTo(offset, settings.cellSize - offset);
			context.lineTo(settings.cellSize - offset, offset);
			context.stroke();
		}

		/*
		 * Initialize the tile matrix.
		 */
		var tiles = [];
		for (var i = 0; i < 3; i++) {
			tiles[i] = [];
			for (var j = 0; j < 3; j++) {
				tiles[i][j] = [];
				for (var k = 0; k < 2; k++) {
					tiles[i][j][k] = [];
					for (var l = 0; l < 2; l++) {
						tiles[i][j][k][l] = drawError;
					}
				}
			}
		}

		tiles[NO_CUT][NO_CUT][ODD][ODD] = drawStraightCross;
		tiles[NO_CUT][NO_CUT][ODD][EVEN] = rotate(drawStraightCross, 90);
		tiles[NO_CUT][NO_CUT][EVEN][EVEN] = rotate(drawStraightCross, 180);
		tiles[NO_CUT][NO_CUT][EVEN][ODD] = rotate(drawStraightCross, 270);

		tiles[HORIZ_CUT][VERT_CUT][EVEN][EVEN] = drawCorner;
		tiles[HORIZ_CUT][VERT_CUT][EVEN][ODD] = rotate(drawCorner, 90);
		tiles[HORIZ_CUT][VERT_CUT][ODD][ODD] = drawCorner;
		tiles[HORIZ_CUT][VERT_CUT][ODD][EVEN] = rotate(drawCorner, 90);

		tiles[VERT_CUT][HORIZ_CUT][EVEN][EVEN] = rotate(drawCorner, 180);
		tiles[VERT_CUT][HORIZ_CUT][ODD][ODD] = rotate(drawCorner, 180);
		tiles[VERT_CUT][HORIZ_CUT][EVEN][ODD] = rotate(drawCorner, 270);
		tiles[VERT_CUT][HORIZ_CUT][ODD][EVEN] = rotate(drawCorner, 270);

		tiles[HORIZ_CUT][HORIZ_CUT][EVEN][EVEN] = drawHorizontalLine;
		tiles[HORIZ_CUT][HORIZ_CUT][ODD][ODD] = drawHorizontalLine;
		tiles[HORIZ_CUT][HORIZ_CUT][EVEN][ODD] = drawHorizontalLine;
		tiles[HORIZ_CUT][HORIZ_CUT][ODD][EVEN] = drawHorizontalLine;

		var drawVerticalLine = rotate(drawHorizontalLine, 90);
		tiles[VERT_CUT][VERT_CUT][EVEN][EVEN] = drawVerticalLine;
		tiles[VERT_CUT][VERT_CUT][ODD][ODD] = drawVerticalLine;
		tiles[VERT_CUT][VERT_CUT][EVEN][ODD] = drawVerticalLine;
		tiles[VERT_CUT][VERT_CUT][ODD][EVEN] = drawVerticalLine;

		tiles[VERT_CUT][NO_CUT][EVEN][EVEN] = drawCurvedCross;
		tiles[VERT_CUT][NO_CUT][ODD][ODD] = drawCurvedCrossUnder;
		tiles[VERT_CUT][NO_CUT][EVEN][ODD] = flipHorizontally(drawCurvedCrossUnder);
		tiles[VERT_CUT][NO_CUT][ODD][EVEN] = flipHorizontally(drawCurvedCross);

		tiles[NO_CUT][VERT_CUT][EVEN][EVEN] = rotate(drawCurvedCrossUnder, 180);
		tiles[NO_CUT][VERT_CUT][EVEN][ODD] = rotate(flipHorizontally(drawCurvedCross), 180);
		tiles[NO_CUT][VERT_CUT][ODD][ODD] = rotate(drawCurvedCross, 180);
		tiles[NO_CUT][VERT_CUT][ODD][EVEN] = rotate(flipHorizontally(drawCurvedCrossUnder), 180);

		tiles[HORIZ_CUT][NO_CUT][EVEN][EVEN] = rotate(flipHorizontally(drawCurvedCross), 90);
		tiles[HORIZ_CUT][NO_CUT][EVEN][ODD]  = rotate(drawCurvedCrossUnder, 270);
		tiles[HORIZ_CUT][NO_CUT][ODD][ODD]   = rotate(flipHorizontally(drawCurvedCrossUnder), 90);
		tiles[HORIZ_CUT][NO_CUT][ODD][EVEN] = rotate(drawCurvedCross, 270);

		tiles[NO_CUT][HORIZ_CUT][EVEN][EVEN] = rotate(flipHorizontally(drawCurvedCrossUnder), 270);
		tiles[NO_CUT][HORIZ_CUT][EVEN][ODD]  = rotate(drawCurvedCross, 90);
		tiles[NO_CUT][HORIZ_CUT][ODD][ODD] = rotate(flipHorizontally(drawCurvedCross), 270);
		tiles[NO_CUT][HORIZ_CUT][ODD][EVEN] = rotate(drawCurvedCrossUnder, 90);

		return tiles;
	})();

	function reverseBits(n) {
        var ret = 0;
        for(var i=0; i<31; i++)
            ret |= ((n>>i)&0x1) << (30-i);
		return ret;
    }
	
	function color(h) {
		h = Math.round(h%360);
		console.log(h);
		return 'hsl('+h+', 100%, 50%)'; 
	}

	/**
	 * A celtic knotwork renderer. Outputs a pattern based on an input array of cuts.
	 *
	 * @param context
	 * @param settings
	 * @param cuts
	 */
	function renderKnotwork(context, settings, cuts) {
		context = context.findOne("#knotwork");
		context.clear();

		settings.halfCellSize = settings.cellSize / 2;
		settings.halfStringSize = settings.stringSize / 2;

		//Set up our styles and colors.
		context.lineCap = 'square'; //"round" looks slightly better, but can lead to rendering artifacts.
		context.lineJoin = 'round';
		context.fillStyle = settings.stringColor;
		context.strokeStyle = settings.strokeColor;
		context.lineWidth = settings.strokeWidth;

		for(var x = 0; x < settings.columns; x++) {
			for(var y = 0; y < settings.rows; y++) {
				//context.save();
				//context.translate(x * settings.cellSize, y * settings.cellSize);
				var g = context.group();
				g.fillStyle = settings.stringColor;
				g.strokeStyle = settings.strokeColor;
				g.lineWidth = settings.strokeWidth;
				g.attr('transform', 'translate('+x*settings.cellSize+' '+y*settings.cellSize+')');

				/*
				 * Figure out which cuts we need to look at. They're different for
				 * even/odd rows and columns. However, the bottom cut is always
				 * the first one we consider.
				 */
				var rowParity = (y + 1) % 2;
				var colParity = (x + 1) % 2;

				var firstCut = NO_CUT;
				var secondCut = NO_CUT;

				if (colParity == 1) {
					firstCut = cuts[y + 1][x / 2];
					secondCut = cuts[y][x / 2];
				} else {
					if (rowParity == 1) {
						firstCut = cuts[y + 1][(x + 1) / 2];
						secondCut = cuts[y][(x - 1) / 2];
					} else {
						firstCut = cuts[y + 1][(x - 1) / 2];
						secondCut = cuts[y][(x + 1) / 2];
					}
				}

				//context.fillStyle = color( reverseBits(x*settings.rows+y) );
				var drawCell = drawFuncs[firstCut][secondCut][rowParity][colParity];
				drawCell(g, settings);
				/*context.fillStyle = 'black';
				context.fillText(x.toString() + "/"+y.toString(), 2,10 );
				context.fillText(cutToStr(firstCut)+"/"+cutToStr(secondCut), 2,20 );

				context.restore();*/
			}
		}
	}

	/**
	 * User interface handlers and utilities
	 */

	function renderGrid(context, settings) {
		context = context.findOne('#grid');
		context.clear();
		var cs = settings.cellSize;
		for (var x = 0; x <= settings.columns; x++) {
			context.line(x*cs, 0, x*cs, settings.rows*cs).
				stroke({ color:settings.gridColor, width:2 });
		}
		for (var y = 0; y <= settings.rows; y++) {
			context.line(0, y*cs, settings.columns*cs, y*cs).
				stroke({ color:settings.gridColor, width:2 });			
		}
	}

	function getVisualCutCenter(settings, cutRow, cutColumn) {
		var center = {
			x : cutColumn * settings.cellSize * 2,
			y : cutRow * settings.cellSize
		};
		if ((cutRow % 2) == 0) {
			center.x += settings.cellSize;
		}
		return center;
	}

	function getVisualNodeCenter(settings, row, column) {
		var center = {
			x : column * settings.cellSize * 2,
			y : row * settings.cellSize
		};
		if ((row % 2) == 1) {
			center.x += settings.cellSize;
		}
		return center;
	}

	/**
	 * Find the control node that's closest to a specific point.
	 *
	 * Returns either a {row: y, column: x} object or null if no nodes
	 * are within selectionDistance of the specified point.
	 *
	 * @param settings
	 * @param offsetX
	 * @param offsetY
	 * @param selectionDistance
	 */
	function getClosestNode(settings, offsetX, offsetY, selectionDistance) {
		selectionDistance = (typeof selectionDistance == "undefined") ? settings.cellSize : selectionDistance;

		//Find the closest control node.
		var closestRow = Math.round(offsetY / settings.cellSize);
		var adjustedOffsetX = offsetX;
		if ((closestRow % 2) == 1) {
			adjustedOffsetX -= settings.cellSize;
		}
		var closestColumn = Math.round(adjustedOffsetX / settings.cellSize / 2);

		//Check if we're close enough to select it.
		var center = getVisualNodeCenter(settings, closestRow, closestColumn);
		var isClose = (Math.abs((offsetX - center.x)) <= selectionDistance)
				&& (Math.abs((offsetY - center.y)) <= selectionDistance);

		//Nodes that are too far or outside the work area are invalid.
		var isValid = isClose &&
			(closestRow >= 0) &&
			(closestRow <= settings.rows) &&
			(closestColumn >= 0) &&
			(closestColumn <= settings.columns / 2);

		if ((closestRow % 2) == 1) {
			isValid = isValid && (closestColumn < settings.columns / 2);
		}

		if ( isValid ) {
			return {
				row : closestRow,
				column : closestColumn
			};
		} else {
			return null;
		}
	}

	function renderCuts(context, settings, cuts) {
		context = context.findOne('#cuts');
		context.clear();
		for (var row = 0; row < cuts.length; row++) {
			for (var column = 0; column < cuts[row].length; column++) {

				//Odd rows have an extra entry that is not used.
				if ( ((row % 2) == 0) && (column == cuts[row].length -1) ) {
					continue;
				}

				var cutType = cuts[row][column];

				//context.save();

				var c = getVisualCutCenter(settings, row, column);
				
				var path = context.line();
				
				if ( cutType == VERT_CUT ) {
					path.plot(c.x, c.y-settings.cellSize,  c.x, c.y+settings.cellSize);

				} else if ( cutType == HORIZ_CUT ) {
					path.plot(c.x-settings.cellSize, c.y, c.x+settings.cellSize, c.y);
				}

				path.stroke({color:settings.cutColor, width:4}).fill('none');
				//context.strokeStyle = ;
				//context.stroke();

				//context.restore();
			}
		}
	}

	function renderNode(context, settings, row, column, selected) {
		selected = (typeof selected == "undefined") ? false : selected;
		var nodeSize = settings.controlNodeSize;
		if ( selected ) {
			nodeSize = settings.selectedControlNodeSize;
		}

		if ((row % 2) == 1) {
			context.fillStyle = settings.controlNodeColor1;
		} else {
			context.fillStyle = settings.controlNodeColor2;
		}

		//context.save();
		var center = getVisualNodeCenter(settings, row, column);
		context.circle().move(center.x, center.y).
			fill(context.fillStyle).id('node'+row+'x'+column).attr('class', 'node');
		//context.translate(center.x, center.y);
		//context.fillRect(- nodeSize / 2, - nodeSize / 2, nodeSize, nodeSize);
		//context.restore();
	}

	function renderControlNodes(context, settings) {
		context = context.findOne('#nodes');
		context.clear();

		var lastColumn = settings.columns / 2;

		for (var row = 0; row < settings.rows + 1; row++) {
			for (var column = 0; column < lastColumn + 1; column++) {
				if (((row % 2) == 1) && (column == lastColumn)) {
					continue;
				}
				renderNode(context, settings, row, column);
			}
		}

		//Draw a cut line from the selected node to the hovered node, if possible.
		/*if ((selectedNode != null) && (hoverNode != null) && canCut(selectedNode, hoverNode)) {
			var start = getVisualNodeCenter(settings, selectedNode.row, selectedNode.column);
			var end = getVisualNodeCenter(settings, hoverNode.row, hoverNode.column);

			context.lineWidth = 4;
			context.strokeStyle = settings.newCutColor;

			pb = PathBuilder();
			pb.beginPath();
			pb.moveTo(start.x, start.y);
			pb.lineTo(end.x, end.y);
			pb.stroke(context);

		}*/

		/*if (selectedNode != null) {
			renderNode(context, settings, selectedNode.row, selectedNode.column, true);
		}

		if (hoverNode != null) {
			renderNode(context, settings, hoverNode.row, hoverNode.column, true);
		}*/
	}

	function renderCurrentCut(context, settings) {
		if ((selectedNode != null) && (hoverNode != null) && canCut(selectedNode, hoverNode)) {
			var start = getVisualNodeCenter(settings, selectedNode.row, selectedNode.column);
			var end = getVisualNodeCenter(settings, hoverNode.row, hoverNode.column);
			context = context.findOne('#cuts');
			var line = context.findOne('#currentCut');
			if(!line) {
				line = context.line().stroke({'width':4, 'color':settings.newCutColor}).attr('id', 'currentCut');
			}
			line.plot(start.x, start.y, end.x, end.y);
			

		}
	}

	/**
	 * Check if two objects describe the same control node.
	 * Caution: Passing in two invalid (null) nodes will return true.
	 *
	 * @param a
	 * @param b
	 */
	function isSameNode(a, b) {
		if ((a != null) && (b != null)) {
			return (a.row == b.row) && (a.column == b.column);
		} else {
			return (a == b);
		}
	}

	/**
	 * Check if we can make a cut from one control node to another.
	 *
	 * Cutting is only allowed when both nodes are distinct and located
	 * on the same horizontal or vertical axis (note that even rows are offset
	 * to the right).
	 *
	 * @param fromNode
	 * @param toNode
	 */
	function canCut(fromNode, toNode) {
		if (isSameNode(fromNode, toNode)) {
			return false;
		}

		var sameRow = (fromNode.row == toNode.row);
		var sameColumn = (fromNode.column == toNode.column) && ((fromNode.row % 2) == (toNode.row % 2));
		return sameRow || sameColumn;
	}

	/**
	 * The main rendering function. Redraws the knotwork and the pattern editor UI.
	 */
	function redrawInterface() {
		//context.clear();
		//context.transform({'translateX':outputOffset.x, 'translateY':outputOffset.y});
		//context.rect('100%', '100%').fill(settings.backgroundColor);

		/*if (settings.showUi && settings.showGrid) {
			renderGrid(context, settings);
		}*/

		renderKnotwork(context, settings, cuts);

		if (settings.showUi) {
			renderCuts(context, settings, cuts);
			renderControlNodes(context, settings);
		}


		/*context.save();
		context.clearRect(0, 0, canvas.width(), canvas.height());
		context.translate(outputOffset.x, outputOffset.y);

		//Clear the work area.
		context.fillStyle = settings.backgroundColor;
		context.fillRect(0, 0, settings.cellSize * settings.columns, settings.cellSize * settings.rows);

		if (settings.showUi && settings.showGrid) {
			renderGrid(context, settings);
		}

		renderKnotwork(context, settings, cuts);

		if (settings.showUi) {
			renderCuts(context, settings, cuts);
			renderControlNodes(context, settings);
		}

		context.restore();*/
	}

	/**
	 * Various utility functions.
	 */

	function makeEmptyPattern(cutRows, cutColumns) {
		var cuts = new Array(cutRows);
		for ( var cutRow = 0; cutRow < cutRows; cutRow++ ) {
			cuts[cutRow] = new Array(cutColumns);
			for ( var cutCol = 0; cutCol < cutColumns; cutCol++ ) {
				cuts[cutRow][cutCol] = NO_CUT;
			}
		}
		return cuts;
	}

	/**
	 * Generate a random cut pattern representing a symmetrical celtic knot.
	 *
	 * The knot produced by this function looks significantly better than a purely
	 * random pattern, but could still be improved.
	 *
	 * You can specify the amount of left-to-right symmetrical and four-quadrants-
	 * symmetrical cuts created by tweaking the bilateralSymmetry and
	 * quadrilateralSymmetry arguments.
	 *
	 * @param cutRows
	 * @param cutColumns
	 * @param totalCuts
	 * @param bilateralSymmetry
	 * @param quadrilateralSymmetry
	 */
	function makeBetterRandomPattern(cutRows, cutColumns, totalCuts, bilateralSymmetry, quadrilateralSymmetry) {
		totalCuts = (typeof totalCuts == 'undefined') ? Math.floor(cutRows * cutColumns * 0.3) : totalCuts;
		bilateralSymmetry = (typeof bilateralSymmetry == 'undefined') ? 50 : bilateralSymmetry;
		quadrilateralSymmetry = (typeof quadrilateralSymmetry == 'undefined') ? 50 : quadrilateralSymmetry;

		var states = [NO_CUT, VERT_CUT, HORIZ_CUT];
		var possibleStates = states;
		var randomCuts = makeEmptyPattern(cutRows, cutColumns);

		var row = 0, column = 0, maxColumns = 0, newState = NO_CUT;

		for (var i = 0; i < totalCuts; i++) {
			row = Math.floor(Math.random() * cutRows);

			maxColumns = (row % 2) ? cutColumns : (cutColumns - 1);
			column = Math.floor(Math.random() * maxColumns);

			possibleStates = states;
			if (row == 0 || row == (cutRows - 1)) {
				possibleStates = [NO_CUT, HORIZ_CUT];
			} else if (column == 0 || column == (maxColumns - 1)) {
				possibleStates = [NO_CUT, VERT_CUT];
			}

			newState = possibleStates[Math.floor(Math.random() * possibleStates.length)];

			randomCuts[row][column] = newState;

			if (Math.random() * (bilateralSymmetry + quadrilateralSymmetry) <= bilateralSymmetry) {
				//Mirror the new cut onto the other side of the pattern.
				randomCuts[row][maxColumns - column - 1] = newState;
			} else {
				//Mirror the new cut onto the other three quadrants of the pattern.
				randomCuts[row][maxColumns - column - 1] = newState;
				randomCuts[cutRows - row - 1][column] = newState;
				randomCuts[cutRows - row - 1][maxColumns - column - 1] = newState;
			}
		}

		return randomCuts;
	}

	function resetPattern() {
		//Default to an empty, no-cuts pattern.
		cuts = makeEmptyPattern(cutRows, cutColumns);
		selectedNode = null;
		hoverNode = null;
	}

	function randomizePattern() {
		cuts = makeBetterRandomPattern(cutRows, cutColumns);
		selectedNode = null;
		hoverNode = null;
	}

	function resizeCanvas(settings) {
		var canvasWidth = settings.columns * settings.cellSize;
		var canvasHeight = settings.rows * settings.cellSize;
			
		canvas.attr('width', canvasWidth+outputOffset.x*2);
		canvas.attr('height', canvasHeight+outputOffset.y*2);
		context.viewbox(-outputOffset.x, -outputOffset.y, 
			canvasWidth+outputOffset.x*2, canvasHeight+outputOffset.y*2);
	}

	function setKnotworkSize(rows, columns) {
		if (rows % 2) {
			rows++;
		}
		if (columns % 2) {
			columns++;
		}

		settings.rows = rows;
		settings.columns = columns;
		cutRows = settings.rows + 1;
		cutColumns = settings.columns / 2 + 1;
		
		resizeCanvas(settings);
		
		renderGrid(context, settings);
		renderCuts(context, settings, cuts);
		renderControlNodes(context, settings);
						
		resetPattern();
	}

	/**
	 * Make the knot's borders closed (i.e. no loose strings at the fringes) or open.
	 *
	 * @param state "open" or "closed"
	 */
	function setBorderState(state) {
		state = (typeof state == "undefined") ? 'open' : state;

		var horizontalBorderState = (state == 'open') ? NO_CUT : HORIZ_CUT;
		for (var column = 0; column < cutColumns - 1; column++) {
			cuts[0][column] = horizontalBorderState;
			cuts[cutRows - 1][column] = horizontalBorderState;
		}

		var verticalBorderState = (state == 'open') ? NO_CUT : VERT_CUT;
		for (var row = 1; row < cutRows; row = row + 2) {
			cuts[row][0] = verticalBorderState;
			cuts[row][cutColumns - 1] = verticalBorderState;
		}
	}

	/**
	 * Initialize the knot generator and editor UI.
	 */
	function init(canvasElement, generatorSettings) {
		generatorSettings = (typeof generatorSettings == "undefined") ? {} : generatorSettings;

		canvas = $(canvasElement);
		context = SVG(canvasElement);//canvasElement.getContext("2d");
		style = canvas[0].getElementById('svgStyle').sheet;
		settings = $.extend({}, settings, generatorSettings);

		setKnotworkSize(settings.rows, settings.columns);
		redrawInterface();

		function pageToCanvas(pageX, pageY){
			var canvasOffset = canvas.offset();
			return {
				'x' : pageX - canvasOffset.left - outputOffset.x,
				'y' : pageY - canvasOffset.top - outputOffset.y
			};
		}

		canvas.bind('mousemove', function(event) {
			if (!settings.showUi) {
				return;
			}

			var position = pageToCanvas(event.pageX, event.pageY);
			var closestNode = getClosestNode(settings, position.x, position.y);
			if ((closestNode != null) && (selectedNode != null) && !canCut(selectedNode, closestNode)){
				closestNode = null;
			}

			if (!isSameNode(closestNode, hoverNode)) {
				hoverNode = closestNode;
				//console.log(hoverNode);
				context.find('.node_hover').attr('class', 'node');
				context.findOne('#node'+hoverNode.row+'x'+hoverNode.column).attr('class', 'node_hover');
				//redrawInterface();
				//renderControlNodes(context, settings);
				renderCurrentCut(context, settings);
			}
		});

		canvas.bind('click', function(event) {
			if (!settings.showUi) {
				return;
			}

			var position = pageToCanvas(event.pageX, event.pageY);
			var closestNode = getClosestNode(settings, position.x, position.y);

			if (closestNode != null) {
				if (isSameNode(selectedNode, closestNode)) {
					//Click on the selected node = deselect it.
					//noinspection JSUnusedAssignment
					selectedNode = null;
				} else if (selectedNode == null) {
					//Click on a node when none are selected = select it.
					//noinspection JSUnusedAssignment
					selectedNode = closestNode;
				} else if (canCut(selectedNode, closestNode)) {
					//Perform a cut from the selected node to the clicked node.

					//Normalize node order so we cut from left to right or top to bottom.
					var startNode = selectedNode;
					var endNode = closestNode;
					if (closestNode.row < startNode.row || closestNode.column < startNode.column) {
						startNode = closestNode;
						endNode = selectedNode;
					}
					var newCut = (startNode.row == endNode.row) ? HORIZ_CUT : VERT_CUT;

					if ( startNode.row == endNode.row ) {

						var startColumn = startNode.column + (startNode.row % 2);
						var endColumn = endNode.column + (startNode.row % 2);

						if (cuts[startNode.row][startColumn] == newCut) {
							newCut = NO_CUT;
						}

						for (var column = startColumn; column < endColumn; column++) {
							cuts[startNode.row][column] = newCut;
						}

					} else {
						if (cuts[startNode.row + 1][startNode.column] == newCut) {
							newCut = NO_CUT;
						}
						for (var row = startNode.row + 1; row < endNode.row; row = row + 2) {
							cuts[row][startNode.column] = newCut;
						}
					}

					selectedNode = null;
					hoverNode = null;
				} else {
					//Clicked on a node that's not a valid cut target =
					//deselect the currently selected node.
					selectedNode = null;
				}
			} else {
				//Click on empty space = deselect the currently selected node.
				if (selectedNode != null) {
					selectedNode = null;
				}
			}

			redrawInterface();
		});

		setStringColor( settings.stringColor );
		setStrokeColor( settings.strokeColor );
		setStrokeWidth( settings.strokeWidth );
	}

	function setStrokeWidth(width) {
		settings.strokeWidth = Math.min(Math.max(width, 1), settings.cellSize - 2);
		style.rules[1].style.strokeWidth = width;
	}

	function setStringColor(color) {
		settings.stringColor = color;
		style.rules[0].style.fill = color;
		style.rules[2].style.stopColor = color;		
		style.rules[3].style.stopColor = chroma(color).darken(1.7).hex();
		//console.log( document.getElementById('svgStyle').childNodes );
	}

	function setStrokeColor(color) {
		settings.strokeColor = color;
		style.rules[1].style.stroke = color;
		//$('.knotlines').css('stroke', color);
		//redrawInterface();
	}


	/**
	 * The public API.
	 */
	return {
		init : init,
		redrawInterface : redrawInterface,
		resetPattern : function(){
			resetPattern();
			redrawInterface();
		},
		randomizePattern : function() {
			randomizePattern();
			redrawInterface();
		},
		setKnotworkSize : function(rows, columns) {
			//The knotwork dimensions must be even numbers.
			if (rows % 2 == 1) {
				rows++;
			}
			if (columns % 2 == 1) {
				columns++;
			}
			setKnotworkSize(rows, columns);
			redrawInterface();
		},
		closeBorder : function() {
			setBorderState('closed');
			redrawInterface();
		},
		openBorder : function() {
			setBorderState('open');
			redrawInterface();
		},
		showUi : function(show) {
			show = (typeof show == "undefined") ? true : show;
			settings.showUi = show;
			context.find('.ui').attr('display', show?'inline':'none');
			if(show) renderCuts();
		},
		setGridSize: function(rows, columns) {
			setKnotworkSize(rows, columns);
			redrawInterface();
		},
		getGridWidth: function() {
			return settings.columns;
		},
		getGridHeight: function() {
			return settings.rows;
		},

		getCellSize: function() {
			return settings.cellSize;
		},
		getStringSize: function() {
			return settings.stringSize;
		},
		getStrokeWidth: function() {
			return settings.strokeWidth;
		},

		setCellSize: function(size) {
			settings.cellSize = Math.max(size, 12);
			if (settings.stringSize > settings.cellSize - 2) {
				settings.stringSize = settings.cellSize - 2;
			}
			if (settings.strokeWidth > settings.cellSize - 2) {
				settings.strokeWidth = settings.cellSize - 2;
			}
			resizeCanvas(settings);
			renderGrid(context, settings);
			renderCuts(context, settings, cuts);
			renderControlNodes(context, settings);
			renderKnotwork(context, settings,cuts);
			//redrawInterface();
		},
		setStringSize: function(size) {
			settings.stringSize = Math.min(Math.max(size, 1), settings.cellSize - 2);
			redrawInterface();
		},
		setStrokeWidth: setStrokeWidth,

		getStringColor: function() {
			return settings.stringColor;
		},
		getStrokeColor: function() {
			return settings.strokeColor;
		},
		getBackgroundColor: function() {
			return settings.backgroundColor;
		},

		setStringColor: setStringColor,
		setStrokeColor: setStrokeColor,
		setBackgroundColor: function(color) {
			settings.backgroundColor = color;
			context.findOne('#bg').fill(color);
			//redrawInterface();
		},

		/**
		 * Get the actual pixel position and dimensions of the generated knot.
		 *
		 * Returns an object {x: offsetx, y: offsety, width: ..., height: ...}
		 */
		getImageDimensions: function() {
			return {
				x : outputOffset.x,
				y : outputOffset.y,
				width: settings.columns * settings.cellSize,
				height: settings.rows * settings.cellSize
			};
		}
	};

})(jQuery);