/*
  Rounded top bars.
  This chart was written by me (Douglas Mak @dagumak) for Moneytree's web application Dec 31 2014 to January 1st 2015.
  It uses svg pathing to creaating a rounded top bar, and then is hooked into the nvd3's existing charting.
*/

nv.models.mtMultiBar = function() {
  "use strict";
  //============================================================
  // Public Variables with Default Settings
  //------------------------------------------------------------

  var margin = {top: 0, right: 0, bottom: 0, left: 0}
    , width = 960
    , height = 500
    , x = d3.scale.ordinal()
    , y = d3.scale.linear()
    , id = Math.floor(Math.random() * 10000) //Create semi-unique ID in case user doesn't select one
    , getX = function(d) { return d.x }
    , getY = function(d) { return d.y }
    , forceY = [0] // 0 is forced by default.. this makes sense for the majority of bar graphs... user can always do chart.forceY([]) to remove
    , clipEdge = true
    , stacked = false
    , stackOffset = 'zero' // options include 'silhouette', 'wiggle', 'expand', 'zero', or a custom function
    , color = nv.utils.defaultColor()
    , hideable = false
    , barColor = null // adding the ability to set the color for each rather than the whole group
    , disabled // used in conjunction with barColor to communicate from multiBarHorizontalChart what series are disabled
    , delay = 1200
    , xDomain
    , yDomain
    , xRange
    , yRange
    , groupSpacing = 0.1
    , dispatch = d3.dispatch('chartClick', 'elementClick', 'elementDblClick', 'elementMouseover', 'elementMouseout')
    , barWidth
    ;

  //============================================================


  //============================================================
  // Private Variables
  //------------------------------------------------------------

  var x0, y0 //used to store previous scales
      ;

  //============================================================


  function chart(selection) {

    function getHeightOfBar(d, i, j) {
      return Math.max(Math.abs(y(d.y + (stacked ? d.y0 : 0)) - y((stacked ? d.y0 : 0))), 1);
    }

    function roundedBars(x, y, width, height, radius, value) {
      if( value < 0 ) {
        return roundedBottomRectangle(x, y, width, height, radius)
      } else {
        return roundedTopRectangle(x, y, width, height, radius)
      }
    }

    // Returns path data for a rectangle with rounded top corners.
    // This is used for positive values
    // The top-left corner is ⟨x,y⟩.
    function roundedTopRectangle(x, y, width, height, radius) {
      return "M" + x + "," + (y + (radius))
           + "a" + -radius + "," + -radius + " 0 0 1 " + radius + "," + -radius
           + "h" + (width - 2*radius)
           + "a" + radius + "," + radius + " 0 0 1 " + radius + "," + radius
           + "v" + (height - radius)
           + "h" + (-width)
           + "z";
    }

    // Returns path data for a rectangle with rounded bottom corners.
    // This is used for negative values
    function roundedBottomRectangle(x, y, width, height, radius) {
      return "M" + x + "," + y
           + "h" + (width)
           + "v" + (height - radius)
           + "a" + -radius + "," + -radius + " 0 0 1 " + -radius + "," + radius
           + "h" + -(width - 2*radius)
           + "a" + radius + "," + radius + " 0 0 1 " + -radius + "," + -radius
           + "v" + -(height - radius)
           + "z";
    }

    selection.each(function(data) {
      var availableWidth = width - margin.left - margin.right,
          availableHeight = height - margin.top - margin.bottom,
          container = d3.select(this);

      if(hideable && data.length) hideable = [{
        values: data[0].values.map(function(d) {
        return {
          x: d.x,
          y: 0,
          series: d.series,
          size: 0.01
        };}
      )}];

      if (stacked)
        data = d3.layout.stack()
                 .offset(stackOffset)
                 .values(function(d){ return d.values })
                 .y(getY)
                 (!data.length && hideable ? hideable : data);


      //add series index to each data point for reference
      data.forEach(function(series, i) {
        series.values.forEach(function(point) {
          point.series = i;
        });
      });


      //------------------------------------------------------------
      // HACK for negative value stacking
      if (stacked)
        data[0].values.map(function(d,i) {
          var posBase = 0, negBase = 0;
          data.map(function(d) {
            var f = d.values[i]
            f.size = Math.abs(f.y);
            if (f.y<0)  {
              f.y1 = negBase;
              negBase = negBase - f.size;
            } else
            {
              f.y1 = f.size + posBase;
              posBase = posBase + f.size;
            }
          });
        });

      //------------------------------------------------------------
      // Setup Scales

      // If there are negative numbers and positive numbers, we will center the 0 line to make it look better
      var verticallyCenterZero = function(minAndMaxArray) {
        var min = Math.abs(minAndMaxArray[0])
        var max = Math.abs(minAndMaxArray[1])
        if( max != 0 && min > max ) {
          minAndMaxArray[1] = -minAndMaxArray[0]
        } else if ( min != 0 && max > min ) {
          minAndMaxArray[0] = -minAndMaxArray[1]
        }
      }

      // remap and flatten the data for use in calculating the scales' domains
      var seriesData = (xDomain && yDomain) ? [] : // if we know xDomain and yDomain, no need to calculate
            data.map(function(d) {
              return d.values.map(function(d,i) {
                return { x: getX(d,i), y: getY(d,i), y0: d.y0, y1: d.y1 }
              })
            });

      x   .domain(xDomain || d3.merge(seriesData).map(function(d) { return d.x }))
          .rangeBands(xRange || [(availableWidth/12), availableWidth - (availableWidth/12)], groupSpacing);

      y   .domain((function() {
              var minAndMax = d3.extent(
              d3.merge(seriesData).map(function(d) {
                  return stacked ? (d.y > 0 ? d.y1 : d.y1 + d.y ) : d.y
                }).concat(forceY)
              )

              verticallyCenterZero(minAndMax); // This will center the 0 axis when both postive and negative exist
              minAndMax[0] *= 1.4; // This is to help keep a gap on the top of the graph
              minAndMax[1] *= 1.4; // This is to help keep a gap on the top of the graph
              return minAndMax;
            })()
          )
          .range(yRange || [availableHeight, 0]);

      // If scale's domain don't have a range, slightly adjust to make one... so a chart can show a single data point
      if (x.domain()[0] === x.domain()[1])
        x.domain()[0] ?
            x.domain([x.domain()[0] - x.domain()[0] * 0.01, x.domain()[1] + x.domain()[1] * 0.01])
          : x.domain([-1,1]);

      if (y.domain()[0] === y.domain()[1])
        y.domain()[0] ?
            y.domain([y.domain()[0] + y.domain()[0] * 0.01, y.domain()[1] - y.domain()[1] * 0.01])
          : y.domain([-1,1]);


      x0 = x0 || x;
      y0 = y0 || y;

      //------------------------------------------------------------


      //------------------------------------------------------------
      // Setup containers and skeleton of chart

      var wrap = container.selectAll('g.nv-wrap.nv-multibar').data([data]);
      var wrapEnter = wrap.enter().append('g').attr('class', 'nvd3 nv-wrap nv-multibar');
      var defsEnter = wrapEnter.append('defs');
      var gEnter = wrapEnter.append('g');
      var g = wrap.select('g')

      gEnter.append('g').attr('class', 'nv-groups');

      wrap.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

      //------------------------------------------------------------



      defsEnter.append('clipPath')
          .attr('id', 'nv-edge-clip-' + id)
        .append('rect');
      wrap.select('#nv-edge-clip-' + id + ' rect')
          .attr('width', availableWidth)
          .attr('height', availableHeight);

      g   .attr('clip-path', clipEdge ? 'url(#nv-edge-clip-' + id + ')' : '');



      var groups = wrap.select('.nv-groups').selectAll('.nv-group')
          .data(function(d) { return d }, function(d,i) { return i });
      groups.enter().append('g')
          .style('stroke-opacity', 1e-6)
          .style('fill-opacity', 1e-6);
      groups.exit()
        .transition()
        .selectAll('path.nv-bar')
        .delay(function(d,i) {
             return i * delay/ data[0].values.length;
        })
          .attr('y', function(d) { return stacked ? y0(d.y0) : y0(0) })
          .attr('height', 0)
          .remove();
      groups
          .attr('class', function(d,i) { return 'nv-group nv-series-' + i })
          .classed('hover', function(d) { return d.hover })
          .style('fill', function(d,i){ return color(d, i) })
          .style('stroke', function(d,i){ return color(d, i) });
      groups
          .transition()
          .style('stroke-opacity', 1)
          .style('fill-opacity', .75);


      var activeStateBarWidth = barWidth*4;
      var xPositionForErrthang = (x.rangeBand()/2) - ((barWidth/2) || 0) - (barWidth*1.5);

      var barsActiveState = groups.selectAll('rect.nv-active-bar')
        .data(function(d) { return d.values });

      barsActiveState.exit().remove();

      var barsActiveStateEnter = barsActiveState.enter().append('rect')
          .attr('class', function(d,i) { return "nv-active-bar active-bar-index-"+i })
          .attr('x', function(d,i,j) { return xPositionForErrthang; })
          .attr('y', 0)
          .attr('height', height )
          .attr('width', function() { return activeStateBarWidth; })
          .style('fill', '#DFDFDF')
          .style('stroke', '#DFDFDF')
          .style('opacity', '0');


      barsActiveState
        .on('mouseover', function(d,i) { //TODO: figure out why j works above, but not here
          d3.select(this).classed('hover', true);
          dispatch.elementMouseover({
            value: getY(d,i),
            point: d,
            series: data[d.series],
            pos: [x(getX(d,i)) + (x.rangeBand() * (stacked ? data.length / 2 : d.series + .5) / data.length), y(getY(d,i) + (stacked ? d.y0 : 0))],  // TODO: Figure out why the value appears to be shifted
            pointIndex: i,
            seriesIndex: d.series,
            e: d3.event
          });
        })
          .on('mouseout', function(d,i) {
            d3.select(this).classed('hover', false);
            dispatch.elementMouseout({
              value: getY(d,i),
              point: d,
              series: data[d.series],
              pointIndex: i,
              seriesIndex: d.series,
              e: d3.event
            });
          })
          .on('click', function(d,i) {
            dispatch.elementClick({
              value: getY(d,i),
              point: d,
              series: data[d.series],
              pos: [x(getX(d,i)) + (x.rangeBand() * (stacked ? data.length / 2 : d.series + .5) / data.length), y(getY(d,i) + (stacked ? d.y0 : 0))],  // TODO: Figure out why the value appears to be shifted
              pointIndex: i,
              seriesIndex: d.series,
              e: d3.event
            });
            d3.event.stopPropagation();
          })
          .on('dblclick', function(d,i) {
            dispatch.elementDblClick({
              value: getY(d,i),
              point: d,
              series: data[d.series],
              pos: [x(getX(d,i)) + (x.rangeBand() * (stacked ? data.length / 2 : d.series + .5) / data.length), y(getY(d,i) + (stacked ? d.y0 : 0))],  // TODO: Figure out why the value appears to be shifted
              pointIndex: i,
              seriesIndex: d.series,
              e: d3.event
            });
            d3.event.stopPropagation();
          });

      barsActiveState
          .transition()
          .attr('transform', function(d,i) { return 'translate(' + (x(getX(d,i))) + ',0)'; })


      var bars = groups.selectAll('path.nv-bar')
          .data(function(d,i) { return (hideable && !data.length) ? hideable.values : d.values });

      bars.exit().remove();

      var barsEnter = bars.enter().append('path')
          .attr('d', function(d,i,j) {
            var xPosition = xPositionForErrthang;
            var yPosition = y0(stacked ? d.y0 : 0);
            var heightOfBar = 0;
            var widthOfBar = ((barWidth || (x.rangeBand()) / (stacked ? 1 : data.length)));

            return roundedBars(xPosition, yPosition, widthOfBar, heightOfBar, widthOfBar/2, getY(d,i));
          })
          .attr('class', function(d,i) { return getY(d,i) < 0 ? 'nv-bar negative' : 'nv-bar positive'})
          .attr('transform', function(d,i) { return 'translate(' + x(getX(d,i)) + ',0)'; });


      bars
          .style('fill', function(d,i,j){ return color(d, j, i);  })
          .style('stroke', function(d,i,j){ return color(d, j, i); });

      bars
          .attr('class', function(d,i,j) {
            var classes = 'nv-bar';
            var height = getHeightOfBar(d,i,j);
            // Rounded top bars have leave behind this residue of pathing when the height is at 0-1, so we can add a class
            // and let the caller deal with it.
            if(height == 1 || height == 0) {
              classes += ' transparent'
            }
            return getY(d,i) < 0 ? (classes + ' negative') : (classes + ' positive')
          })
          .transition()
          .attr('transform', function(d,i) { return 'translate(' + x(getX(d,i)) + ',0)'; })

      if (barColor) {
        if (!disabled) disabled = data.map(function() { return true });
        bars
          .style('fill', function(d,i,j) { return d3.rgb(barColor(d,i)).darker(  disabled.map(function(d,i) { return i }).filter(function(d,i){ return !disabled[i]  })[j]   ).toString(); })
          .style('stroke', function(d,i,j) { return d3.rgb(barColor(d,i)).darker(  disabled.map(function(d,i) { return i }).filter(function(d,i){ return !disabled[i]  })[j]   ).toString(); });
      }


      var barsHoverState = groups.selectAll('rect.nv-hover-bar')
        .data(function(d) { return d.values });

      barsHoverState.exit().remove();

      var barsHoverStateEnter = barsHoverState.enter().append('rect')
        .attr('class', function(d,i) { return "nv-hover-bar hover-bar-index-"+i })
        .attr('x', function(d,i,j) { return xPositionForErrthang; })
        .attr('y', 0)
        .attr('height', height )
        .attr('width', function() { return activeStateBarWidth; })
        .style('opacity', '0');


      barsHoverState
        .on('mouseover', function(d,i) {
          d3.select(this).classed('hover', true);
          d3.select(".nv-active-bar.active-bar-index-"+i).classed('hover', true);
          if(getY(d,i) != null) {
            dispatch.elementMouseover({
              value: getY(d, i),
              point: d,
              series: data[d.series],
              pos: [x(getX(d, i)) + (x.rangeBand() * (stacked ? data.length / 2 : d.series + .5) / data.length), y(getY(d, i) + (stacked ? d.y0 : 0))],  // TODO: Figure out why the value appears to be shifted
              pointIndex: i,
              seriesIndex: d.series,
              e: d3.event
            });
          }
        })
        .on('mouseout', function(d,i) {
          d3.select(this).classed('hover', false);
          d3.select(".nv-active-bar.active-bar-index-"+i).classed('hover', false);
          dispatch.elementMouseout({
            value: getY(d,i),
            point: d,
            series: data[d.series],
            pointIndex: i,
            seriesIndex: d.series,
            e: d3.event
          });
        })
        .on('click', function(d,i) {
          dispatch.elementClick({
            value: getY(d,i),
            point: d,
            series: data[d.series],
            pos: [x(getX(d,i)) + (x.rangeBand() * (stacked ? data.length / 2 : d.series + .5) / data.length), y(getY(d,i) + (stacked ? d.y0 : 0))],  // TODO: Figure out why the value appears to be shifted
            pointIndex: i,
            seriesIndex: d.series,
            e: d3.event
          });
          d3.event.stopPropagation();
        })
        .on('dblclick', function(d,i) {
          dispatch.elementDblClick({
            value: getY(d,i),
            point: d,
            series: data[d.series],
            pos: [x(getX(d,i)) + (x.rangeBand() * (stacked ? data.length / 2 : d.series + .5) / data.length), y(getY(d,i) + (stacked ? d.y0 : 0))],  // TODO: Figure out why the value appears to be shifted
            pointIndex: i,
            seriesIndex: d.series,
            e: d3.event
          });
          d3.event.stopPropagation();
        });

      barsHoverState
        .transition()
        .attr('transform', function(d,i) { return 'translate(' + (x(getX(d,i))) + ',0)'; })



      if (stacked)
          bars
            .transition()
            .delay(function(d,i) {

                  return i * delay / data[0].values.length;
            })
            .attr('d', function(d,i,j) {
              var xPosition = x.rangeBand()/2;
              var yPosition = y((stacked ? d.y1 : 0));
              var heightOfBar = getHeightOfBar(d,i,j);

              var widthOfBar = ((barWidth || (x.rangeBand()) / (stacked ? 1 : data.length)));
              return roundedBars(xPosition, yPosition, widthOfBar, heightOfBar, widthOfBar/2, getY(d,i));
            });
      else
          bars
            .transition()
            .delay(function(d,i) {
                return i * delay/ data[0].values.length;
            })
            .attr('d', function(d,i,j) {
              var xPosition = xPositionForErrthang + barWidth*1.5; // This allows it to be always centered relative to the active bar
              var heightOfBar = getHeightOfBar(d,i,j);
              var yPosition = getY(d,i) < 0 ?
                          y(0) :
                          y(0) - y(getY(d,i)) < 1 ?
                          y(0) - 1 :
                          y(getY(d,i)) || 0;

              var widthOfBar = ((barWidth || (x.rangeBand()) / (stacked ? 1 : data.length)));
              return roundedBars(xPosition, yPosition, widthOfBar, heightOfBar, widthOfBar/2, getY(d,i));
            });



      //store old scales for use in transitions on update
      x0 = x.copy();
      y0 = y.copy();

    });

    return chart;
  }


  //============================================================
  // Expose Public Variables
  //------------------------------------------------------------

  chart.dispatch = dispatch;

  chart.options = nv.utils.optionsFunc.bind(chart);

  chart.x = function(_) {
    if (!arguments.length) return getX;
    getX = _;
    return chart;
  };

  chart.y = function(_) {
    if (!arguments.length) return getY;
    getY = _;
    return chart;
  };

  chart.margin = function(_) {
    if (!arguments.length) return margin;
    margin.top    = typeof _.top    != 'undefined' ? _.top    : margin.top;
    margin.right  = typeof _.right  != 'undefined' ? _.right  : margin.right;
    margin.bottom = typeof _.bottom != 'undefined' ? _.bottom : margin.bottom;
    margin.left   = typeof _.left   != 'undefined' ? _.left   : margin.left;
    return chart;
  };

  chart.width = function(_) {
    if (!arguments.length) return width;
    width = _;
    return chart;
  };

  chart.height = function(_) {
    if (!arguments.length) return height;
    height = _;
    return chart;
  };

  chart.xScale = function(_) {
    if (!arguments.length) return x;
    x = _;
    return chart;
  };

  chart.yScale = function(_) {
    if (!arguments.length) return y;
    y = _;
    return chart;
  };

  chart.xDomain = function(_) {
    if (!arguments.length) return xDomain;
    xDomain = _;
    return chart;
  };

  chart.yDomain = function(_) {
    if (!arguments.length) return yDomain;
    yDomain = _;
    return chart;
  };

  chart.xRange = function(_) {
    if (!arguments.length) return xRange;
    xRange = _;
    return chart;
  };

  chart.yRange = function(_) {
    if (!arguments.length) return yRange;
    yRange = _;
    return chart;
  };

  chart.barWidth = function(_) {
    if (!arguments.length) return barWidth;
    barWidth = _;
    return chart;
  };

  chart.forceY = function(_) {
    if (!arguments.length) return forceY;
    forceY = _;
    return chart;
  };

  chart.stacked = function(_) {
    if (!arguments.length) return stacked;
    stacked = _;
    return chart;
  };

  chart.stackOffset = function(_) {
    if (!arguments.length) return stackOffset;
    stackOffset = _;
    return chart;
  };

  chart.clipEdge = function(_) {
    if (!arguments.length) return clipEdge;
    clipEdge = _;
    return chart;
  };

  chart.color = function(_) {
    if (!arguments.length) return color;
    color = nv.utils.getColor(_);
    return chart;
  };

  chart.barColor = function(_) {
    if (!arguments.length) return barColor;
    barColor = nv.utils.getColor(_);
    return chart;
  };

  chart.disabled = function(_) {
    if (!arguments.length) return disabled;
    disabled = _;
    return chart;
  };

  chart.id = function(_) {
    if (!arguments.length) return id;
    id = _;
    return chart;
  };

  chart.hideable = function(_) {
    if (!arguments.length) return hideable;
    hideable = _;
    return chart;
  };

  chart.delay = function(_) {
    if (!arguments.length) return delay;
    delay = _;
    return chart;
  };

  chart.groupSpacing = function(_) {
    if (!arguments.length) return groupSpacing;
    groupSpacing = _;
    return chart;
  };

  //============================================================


  return chart;
}