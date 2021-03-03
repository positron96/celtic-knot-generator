/**
 * UI handlers for the knot generator.
 *
 * Copyright (c) 2012 Janis Elsts, whiteshadow@w-shadow.com
 */

$(document).ready(function() {
	var svg = document.getElementById("mySVG");

	KnotMaker.init(svg);
	KnotMaker.setKnotworkSize(10, 10);

	$('#reset-pattern').click(function(){
		KnotMaker.resetPattern();
	});

	$('#randomize-pattern').click(function(){
		KnotMaker.randomizePattern();
	});

	$('#close-border').click(function() {
		KnotMaker.closeBorder();
	});

	$('#open-border').click(function() {
		KnotMaker.openBorder();
	});

	$('#show-ui').change(function() {
		KnotMaker.showUi($(this).is(':checked'));
	});

	var isUiUpdating = false;

	function updateOptionsUi() {
		isUiUpdating = true;

		$('#grid-width').val(KnotMaker.getGridWidth());
		$('#grid-height').val(KnotMaker.getGridHeight());

		$('#cell-size').val(KnotMaker.getCellSize());
		$('#cell-size-num').text(KnotMaker.getCellSize());

		$('#string-size')
			.attr('max', KnotMaker.getCellSize() - 2)
			.val(KnotMaker.getStringSize());
		$('#string-size-num').text(KnotMaker.getStringSize());


		$('#stroke-width')
			.attr('max', KnotMaker.getCellSize() - 2)
			.val(KnotMaker.getStrokeWidth());
		$('#stroke-width-num').text(KnotMaker.getStrokeWidth());


		$('#string-color').val(KnotMaker.getStringColor());
		$('#stroke-color').val(KnotMaker.getStrokeColor());
		$('#background-color').val(KnotMaker.getBackgroundColor());

		isUiUpdating = false;
	}
	updateOptionsUi();

	$('#set-grid-size').click(function() {
		var width = parseInt($('#grid-width').val(), 10);
		var height = parseInt($('#grid-height').val(), 10);
		if (isNaN(width) || isNaN(height)) {
			alert("Invalid grid size! Width and height must be even numbers between 4 and 100.");
			return;
		}

		width = Math.min(Math.max(width, 4), 100);
		height = Math.min(Math.max(height, 4), 100);
		KnotMaker.setGridSize(height, width);
		updateOptionsUi();
	});

	/**
	 * Cell size, string size and stroke (border) thickness are all related.
	 * The string can't be any wider than the cell - a small safety margin.
	 * The same goes for stroke width.
	 */

	$('#cell-size, #string-size, #stroke-width').change(function() {
		if (isUiUpdating) {
			return;
		}

		var slider = $(this);
		var tip = $('#' + slider.attr('id') + '-num');
		tip.text(slider.val());
	});

	$('#cell-size').change(function() {
		if (isUiUpdating) {
			return;
		}

		KnotMaker.setCellSize($(this).val());
		updateOptionsUi();
	});

	$('#string-size').change(function() {
		if (isUiUpdating) {
			return;
		}
		KnotMaker.setStringSize($(this).val());
		updateOptionsUi();
	});

	$('#stroke-width').change(function() {
		if (isUiUpdating) {
			return;
		}
		KnotMaker.setStrokeWidth($(this).val());
		updateOptionsUi();
	});

	$('input.minicolors').minicolors({
		letterCase: 'uppercase',
		change: function(hex) {
			//Color inputs have IDs like this - "something-color".
			var which = $(this).attr('id').split('-')[0]; //Get the "something" part.
			switch (which) {
				case 'string':
					KnotMaker.setStringColor(hex);
					break;
				case 'stroke':
					KnotMaker.setStrokeColor(hex);
					break;
				case 'background':
					KnotMaker.setBackgroundColor(hex);
					break;
			}
		}
	});



	var ContainerElements = ["svg","g", "linearGradient"];
	var RelevantStyles = {
		"rect":["fill","stroke","stroke-width"],
		"path":["fill","stroke","stroke-width"],
		"circle":["fill","stroke","stroke-width"],
		"line":["stroke","stroke-width"],
		"text":["fill","font-size","text-anchor"],
		"polygon":["stroke","fill"],
		"stop":["offset", "stop-color", "stop-opacity"]
	};


	function applySvgStyle(node, origNode){
		var nodes = node.childNodes;
		var origNodes = origNode.childNodes;     

		for (var cd = 0; cd < nodes.length; cd++){
			var child = nodes[cd];

			var tagName = child.tagName;
			if (ContainerElements.indexOf(tagName) != -1){
				applySvgStyle(child, origNodes[cd])
			} else if (tagName in RelevantStyles){
				var styleDef = window.getComputedStyle(origNodes[cd]);

				var styleString = "";
				for (var st = 0; st < RelevantStyles[tagName].length; st++){
					styleString += RelevantStyles[tagName][st] + ":" + styleDef.getPropertyValue(RelevantStyles[tagName][st]) + "; ";
				}
				child.setAttribute("style",styleString);
			}
		}

	}

	
	function saveSvg(SVGElem){

		var oDOM = SVGElem.cloneNode(true)
		applySvgStyle(oDOM, SVGElem)

		var data = new XMLSerializer().serializeToString(oDOM);
		var blob = new Blob([data], { type: "image/svg+xml;charset=utf-8" });

		saveAs(blob, "image.svg");

		/*var url = URL.createObjectURL(svg);

		var link = document.createElement("a");
		link.setAttribute("target","_blank");
		var Text = document.createTextNode("Export");
		link.appendChild(Text);
		link.href=url;

		document.body.appendChild(link);*/
	}


	$('#download-image').click(function() {
		var button = $(this);
		button.val('Processing...');

		var showUi = $('#show-ui').is(':checked');
		KnotMaker.showUi(false);

		saveSvg(document.getElementById("mySVG"));		

		KnotMaker.showUi(showUi);
	});
});