/* Forecast-only calculations. No memo/history access and no missing-to-zero conversion. */
(function (root, factory) {
  const value = factory();
  if (typeof module === 'object' && module.exports) module.exports = value;
  else root.HaruWeather = value;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const HOUR = 3600000, FRESH_MS = HOUR, RANK_MAX_AGE = 6 * HOUR;
  const NUMERIC_FIELDS = ['snowfall', 'temperature_2m', 'wind_speed_10m', 'wind_gusts_10m', 'weather_code', 'cloud_cover', 'visibility', 'rain', 'showers'];
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const today = (now = Date.now()) => new Date(now + 9 * HOUR).toISOString().slice(0, 10);
  const addDays = (date, amount) => new Date(Date.parse(date + 'T00:00:00Z') + amount * 24 * HOUR).toISOString().slice(0, 10);
  const dateList = (now = Date.now()) => Array.from({length: 7}, (_, i) => addDays(today(now), i));
  const average = a => a.reduce((s, n) => s + n, 0) / a.length;
  const reduceComplete = (h, indices, field, reduce) => {
    const a = indices.map(i => h[field]?.[i]);
    return a.length && a.every(finite) ? reduce(a) : null;
  };
  function weather(code) {
    if (!finite(code)) return {label: '天気未取得', icon: '—'};
    if (code >= 95) return {label: '雷雨', icon: '☈'};
    if ([71,73,75,77,85,86].includes(code)) return {label: '雪', icon: '❄'};
    if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) return {label: '雨', icon: '☂'};
    if ([45,48].includes(code)) return {label: '霧', icon: '≋'};
    if (code === 3) return {label: '曇り', icon: '☁'};
    if ([0,1,2].includes(code)) return {label: code === 2 ? '晴れ時々曇り' : '晴れ', icon: '☀'};
    return {label: '天気未取得', icon: '—'};
  }
  function validate(raw) {
    if (!raw || raw.timezone !== 'Asia/Tokyo' || !raw.hourly || !Array.isArray(raw.hourly.time)) throw Error('予報の形式が合いません');
    const {hourly: h, hourly_units: u} = raw;
    const units = {snowfall:'cm',temperature_2m:'°C',wind_speed_10m:'m/s',wind_gusts_10m:'m/s',cloud_cover:'%',visibility:'m',rain:'mm',showers:'mm'};
    if (!u || Object.entries(units).some(([k,v]) => u[k] !== v)) throw Error('予報の単位を確認できません');
    if (!h.time.length || h.time.some((t,i) => typeof t !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:00$/.test(t) || (i && t <= h.time[i-1]))) throw Error('予報の時刻が不正です');
    for (const field of NUMERIC_FIELDS) if (!Array.isArray(h[field]) || h[field].length !== h.time.length || h[field].some(v => v !== null && !finite(v))) throw Error('予報に不正な値があります');
    return h;
  }
  function summarize(raw, date) {
    const h = validate(raw), end = date + 'T09:00', start = addDays(date, -1) + 'T09:00';
    const morning = [], day = [];
    h.time.forEach((t,i) => {
      if (t > start && t <= end) morning.push(i);
      if (t.slice(0,10) === date && t.slice(11,13) >= '09' && t.slice(11,13) <= '15') day.push(i);
    });
    const snow = morning.length === 24 ? reduceComplete(h, morning, 'snowfall', a => a.reduce((s,v)=>s+v,0)) : null;
    const completeDay = day.length === 7;
    const metric = (field, reduce) => completeDay ? reduceComplete(h, day, field, reduce) : null;
    const tmin = metric('temperature_2m', a=>Math.min(...a)), tmax = metric('temperature_2m', a=>Math.max(...a));
    const wind = metric('wind_speed_10m', a=>Math.max(...a)), gust = metric('wind_gusts_10m', a=>Math.max(...a));
    const cloud = metric('cloud_cover', average), visibility = metric('visibility', a=>Math.min(...a));
    const rainOnly = metric('rain', a=>a.reduce((s,v)=>s+v,0)), showers = metric('showers', a=>a.reduce((s,v)=>s+v,0));
    const rain = finite(rainOnly) && finite(showers) ? rainOnly + showers : null;
    const codes = day.map(i=>h.weather_code[i]), knownCodes = [0,1,2,3,45,48,51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,97,99];
    const completeCodes = completeDay && codes.every(c=>knownCodes.includes(c));
    const labels = codes.map(c=>weather(c).label), counts = labels.reduce((a,s)=>(a[s]=(a[s]||0)+1,a),{});
    const dominant = completeCodes ? codes.find(c=>weather(c).label === Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0]) : null;
    const thunder = completeCodes ? codes.some(c=>c>=95) : null;
    const valid = [snow,tmin,tmax,wind,gust,cloud,visibility,rain].every(finite) && completeCodes;
    const flags = [];
    if (finite(wind) && wind >= 10 || finite(gust) && gust >= 18) flags.push('風が強い予報');
    if (thunder) flags.push('雷雨の予報あり');
    if (finite(visibility) && visibility < 1000) flags.push('視界が悪い時間あり');
    if (finite(rain) && rain >= 2) flags.push('日中に雨の予報');
    if (finite(tmax) && tmax > 3 && finite(snow) && snow > 0) flags.push('気温上昇に注意');
    return {date,snow,tmin,tmax,wind,gust,cloud,visibility,rain,thunder,code:dominant,valid,flags,
      hours:[9,12,15].map(hour=>{const i=h.time.indexOf(date+'T'+String(hour).padStart(2,'0')+':00');return {hour,temp:i<0?null:h.temperature_2m[i],wind:i<0?null:h.wind_speed_10m[i],code:i<0?null:h.weather_code[i]};})};
  }
  function recommend(d, mode = 'balanced') {
    if (!d?.valid || !['balanced','snow','sun'].includes(mode)) return {score:null,eligible:false,reasons:[]};
    const windPenalty = d.wind * 2 + Math.max(0,d.gust-10) * 2;
    const rainPenalty = Math.min(d.rain * 8, 35);
    const snowPoints = Math.min(d.snow, 25), sunPoints = (100-d.cloud)/5;
    const score = 60 + snowPoints * (mode==='snow'?2:mode==='sun'?.15:.8) + sunPoints * (mode==='sun'?2:1)
      - windPenalty - rainPenalty - (d.visibility<1000?30:0) - (d.thunder?80:0);
    const eligible = d.wind < 10 && d.gust < 18 && !d.thunder && d.visibility >= 1000 && d.rain < 2;
    const reasons = [];
    if (mode !== 'sun' && d.snow >= 1) reasons.push('朝までの新雪 '+format(d.snow,1)+'cm予想');
    if (d.cloud <= 40) reasons.push('日中は雲が少なめ');
    if (d.wind < 5) reasons.push('日中の最大風速 '+format(d.wind,1)+'m/s');
    if (d.rain < .2) reasons.push('日中の雨は少ない予想');
    if (!reasons.length) reasons.push('雪・風・雨を合わせて比較');
    return {score,eligible,reasons:reasons.slice(0,3)};
  }
  function ranked(records,date,mode,now=Date.now()) {
    return records.map(r=>({...r,day:r.days?.find(d=>d.date===date)})).map(r=>({...r,recommendation:recommend(r.day,mode),
      age:now-Date.parse(r.fetchedAt)})).sort((a,b)=>{
        const eligible = r=>r.recommendation.eligible && finite(r.age) && r.age>=-300000 && r.age<RANK_MAX_AGE;
        const ae=eligible(a),be=eligible(b);if(ae!==be)return ae?-1:1;
        return (b.recommendation.score??-Infinity)-(a.recommendation.score??-Infinity)||a.resort.name.localeCompare(b.resort.name,'ja');
      });
  }
  function cacheState(fetchedAt,now=Date.now()) {
    const age=now-Date.parse(fetchedAt);
    if (!finite(age) || age < -300000) return 'invalid';
    return age <= FRESH_MS ? 'fresh' : age < RANK_MAX_AGE ? 'cached' : 'old';
  }
  function requestUrl(resorts) {
    const p=new URLSearchParams({latitude:resorts.map(r=>r.lat).join(','),longitude:resorts.map(r=>r.lon).join(','),
      elevation:resorts.map(r=>finite(r.elevation)?r.elevation:'nan').join(','),hourly:NUMERIC_FIELDS.join(','),timezone:'Asia/Tokyo',
      forecast_days:'7',past_days:'1',wind_speed_unit:'ms'});
    return 'https://api.open-meteo.com/v1/forecast?'+p;
  }
  function fallbackUrl(resorts) {
    return requestUrl(resorts).replace('api.open-meteo.com/v1/forecast','ensemble-api.open-meteo.com/v1/ensemble')+'&models=gfs025';
  }
  function compact(raw) {
    validate(raw);
    return {timezone:raw.timezone,hourly:{time:raw.hourly.time,...Object.fromEntries(NUMERIC_FIELDS.map(k=>[k,raw.hourly[k]]))},
      hourly_units:{time:raw.hourly_units.time,...Object.fromEntries(NUMERIC_FIELDS.map(k=>[k,raw.hourly_units[k]]))}};
  }
  function format(n, decimals=0) {
    if (!finite(n)) return '—';
    if (n>0 && n<.1) return '<0.1';
    return Number(n.toFixed(decimals)).toLocaleString('ja-JP',{maximumFractionDigits:decimals});
  }
  return {HOUR,FRESH_MS,RANK_MAX_AGE,NUMERIC_FIELDS,finite,today,addDays,dateList,weather,validate,summarize,recommend,ranked,cacheState,requestUrl,fallbackUrl,compact,format};
});

