/* Fictional values for layout comparison only. Never written to forecast/history storage. */
(function(root){
  const areas=[
    {id:'hakuba',name:'白馬エリア',spots:[
      {id:'happo',name:'白馬八方尾根',short:'八方尾根',elevation:1200},
      {id:'tsugaike',name:'栂池高原',short:'栂池高原',elevation:1300},
      {id:'goryu',name:'白馬五竜・Hakuba47',short:'五竜・47',elevation:1300},
      {id:'iwatake',name:'白馬岩岳',short:'白馬岩岳',elevation:1100}]},
    {id:'yuzawa',name:'湯沢・南魚沼エリア',spots:[
      {id:'gala',name:'GALA湯沢',short:'GALA湯沢',elevation:800},
      {id:'kagura',name:'かぐら',short:'かぐら',elevation:1600},
      {id:'naeba',name:'苗場',short:'苗場',elevation:1200},
      {id:'ishiuchi',name:'石打丸山',short:'石打丸山',elevation:700}]},
    {id:'okumino',name:'奥美濃エリア',spots:[
      {id:'takasu',name:'高鷲スノーパーク',short:'高鷲SP',elevation:1200},
      {id:'dynaland',name:'ダイナランド',short:'ダイナランド',elevation:1200},
      {id:'washigatake',name:'鷲ヶ岳',short:'鷲ヶ岳',elevation:1300},
      {id:'whitepia',name:'ホワイトピアたかす',short:'ホワイトピア',elevation:1200}]},
    {id:'niseko',name:'ニセコ・ルスツエリア',spots:[
      {id:'hirafu',name:'ニセコ グラン・ヒラフ',short:'グラン・ヒラフ',elevation:800},
      {id:'annupuri',name:'ニセコアンヌプリ',short:'アンヌプリ',elevation:800},
      {id:'village',name:'ニセコビレッジ',short:'ビレッジ',elevation:800},
      {id:'rusutsu',name:'ルスツ',short:'ルスツ',elevation:600}]}
  ];
  const snowPattern=[4,12,9,2,0,6,14],cloudPattern=[38,92,72,10,15,60,85];
  function build(dates){
    return areas.map((area,a)=>({...area,spots:area.spots.map((spot,s)=>({...spot,area:area.name,
      days:dates.map((date,d)=>{
        const snow=Math.max(0,snowPattern[d]+[2,-1,4,-3][s]+a),wind=[3.2,4.6,6.1,2.5][s]+(d===2?4:0)+a*.2;
        const cloud=Math.min(100,Math.max(0,cloudPattern[d]+s*3-a*4));
        const tmin=-8+(d%3)+s,tmax=tmin+5;
        const code=cloud>65?71:cloud>40?3:cloud>20?2:0,gust=wind+4.2,rain=d===4&&s===3?2.2:0;
        const flags=[];
        if(wind>=10||gust>=18)flags.push('風が強い予報');
        if(rain>=2)flags.push('雨の時間あり');
        return {date,snow,wind,gust,tmin,tmax,cloud,visibility:cloud>90?1800:15000,rain,code,valid:true,thunder:false,flags,
          hours:[9,12,15].map((hour,i)=>({hour,code:i===0&&snow>8?71:i===2&&cloud<60?0:code,temp:tmin+[1,5,3][i],wind:Math.max(0,wind-[1,.2,0][i])}))};
      })}))}));
  }
  root.WeatherDesignSamples={areas,build};
})(typeof globalThis==='object'?globalThis:this);

