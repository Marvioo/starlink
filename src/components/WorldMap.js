import React, {Component} from 'react';
import { feature } from 'topojson-client';
import axios from 'axios';
import { geoKavrayskiy7 } from 'd3-geo-projection';
import { geoGraticule, geoPath } from 'd3-geo';
import { select as d3Select } from 'd3-selection';
import { Spin } from "antd";
import { schemeCategory10 } from "d3-scale-chromatic";
import * as d3Scale from "d3-scale";
import { timeFormat as d3TimeFormat } from "d3-time-format";

import {
  BASE_URL,
  WORLD_MAP_URL,
  SATELLITE_POSITION_URL,
  SAT_API_KEY
} from "../constants";


const width = 960;
const height = 600;

class WorldMap extends Component {
    constructor(){
        super();
        this.state = {
            isDrawing: false,
            isLoading: false
        }
        this.map = null;
        // color range
        this.color = d3Scale.scaleOrdinal(schemeCategory10);
        this.refMap = React.createRef();
        this.refTrack = React.createRef();
    
    }

    componentDidMount() {
        axios.get(WORLD_MAP_URL)
            .then(res => {
                const { data } = res;
                const land = feature(data, data.objects.countries).features;
                this.generateMap(land);
            })
            .catch(e => console.log('err in fecth world map data ', e))
    }

    componentDidUpdate(prevProps, prevState, snapshot) {
        if (prevProps.satData !== this.props.satData) {
            // Step 1: get observer data from props.observerData
            if (prevProps.satData !== this.props.satData) {
                const {
                  latitude,
                  longitude,
                  elevation,
                  altitude,
                  duration
                } = this.props.observerData;
                const endTime = duration * 60;
                
                this.setState({
                    isLoading: true
                  });

                // Step 2: for each sat, we get id from props.satData
                // Step 3: for each sat, get its position
                const urls = this.props.satData.map(sat => {
                    const { satid } = sat;
                    const url = `${BASE_URL}/api/${SATELLITE_POSITION_URL}/${satid}/${latitude}/${longitude}/${elevation}/${endTime}/&apiKey=${SAT_API_KEY}`;
            
                    return axios.get(url);
                });

                Promise.all(urls)
                .then(res => {
                    const arr = res.map(sat => sat.data);
                    // we are drawing this path so isDrawing is true
                    this.setState({
                        isLoading: false,
                        isDrawing: true
                    });

                    if (!prevState.isDrawing) {
                        this.track(arr);
                    } else {
                        const oHint = document.getElementsByClassName("hint")[0];
                        oHint.innerHTML =
                        "Please wait for these satellite animation to finish before selection new ones!";
                    }
                })
                .catch(e => {
                    console.log("err in fetch satellite position -> ", e.message);
                });
            }
            
            
            
            // step 4: display each position on the map
        }
    }

    track = data => {
        if (!data[0].hasOwnProperty("positions")) {
            throw new Error("no position data");
            return;
          }
          const len = data[0].positions.length;
          const { duration } = this.props.observerData;
          // we need to draw the time on this map
          const { context2 } = this.map;

          let now = new Date();
      
          let i = 0;
          // display time info on the overlay canvas

          let timer = setInterval(() => {
            // current time 
            let ct = new Date();
            
            // calculate the elapsed time
            let timePassed = i === 0 ? 0 : ct - now;

            // calculate the actual time
            let time = new Date(now.getTime() + 60 * timePassed);
            
            // clear the previous drawing
            context2.clearRect(0, 0, width, height);
      
            context2.font = "bold 14px sans-serif";
            context2.fillStyle = "#333";
            context2.textAlign = "center";
            context2.fillText(d3TimeFormat(time), width / 2, 10);
      
            if (i >= len) {
              clearInterval(timer);
              this.setState({ isDrawing: false });
              const oHint = document.getElementsByClassName("hint")[0];
              oHint.innerHTML = "";
              return;
            }
      
            data.forEach(sat => {
              const { info, positions } = sat;
              this.drawSat(info, positions[i]);
            });
      
            i += 60;
          }, 1000);
    }

    drawSat = (sat, pos) => {
        const { satlongitude, satlatitude } = pos;
    
        if (!satlongitude || !satlatitude) return;
    
        const { satname } = sat;
        const nameWithNumber = satname.match(/\d+/g).join("");
    
        const { projection, context2 } = this.map;
        const xy = projection([satlongitude, satlatitude]);
    
        context2.fillStyle = this.color(nameWithNumber);
        context2.beginPath();
        context2.arc(xy[0], xy[1], 4, 0, 2 * Math.PI);
        context2.fill();
    
        context2.font = "bold 11px sans-serif";
        context2.textAlign = "center";
        context2.fillText(nameWithNumber, xy[0], xy[1] + 14);
      };
    

    generateMap(land){
        // Step1: get world map shape
        const projection = geoKavrayskiy7()
            .scale(170)
            .translate([width / 2, height / 2])
            .precision(.1);

        const graticule = geoGraticule();

        // Step2: get canvas
        const canvas = d3Select(this.refMap.current)
            .attr("width", width)
            .attr("height", height);

        const canvas2 = d3Select(this.refTrack.current)
            .attr("width", width)
            .attr("height", height);


        const context = canvas.node().getContext("2d");
        const context2 = canvas2.node().getContext("2d");

        let path = geoPath()
            .projection(projection)
            .context(context);

        // Step3: project world map data on the map
        land.forEach(ele => {
            context.fillStyle = '#B3DDEF';
            context.strokeStyle = '#000';
            context.globalAlpha = 0.7;
            context.beginPath();
            path(ele);
            context.fill();
            context.stroke();

            context.strokeStyle = 'rgba(220, 220, 220, 0.1)';
            context.beginPath();
            path(graticule());
            context.lineWidth = 0.1;
            context.stroke();

            context.beginPath();
            context.lineWidth = 0.5;
            path(graticule.outline());
            context.stroke();
        });

        this.map = {
            projection: projection,
            graticule: graticule,
            context: context,
            context2: context2
        };
      
    }

    render() {
        const { isLoading } = this.state;
        return (
            <div className="map-box">
                {isLoading ? (
                    <div className="spinner">
                    <Spin tip="Loading..." size="large" />
                    </div>
                ) : null}
                <canvas className="map" ref={this.refMap} />
                <canvas className="track" ref={this.refTrack} />
                <div className="hint" />
            </div>
        );
    }
}

export default WorldMap;

