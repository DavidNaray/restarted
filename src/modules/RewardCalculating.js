function calculateReward(user){

    const population= user.Resources.ManPower.TotalPopulation;


    //when you achieve a population of 5000, you get a 5% chance to get a tech
    const popscaling=Math.min(population,5000)/1000
    const randomNum=Math.floor(Math.random() * 101);
    var getTech=false;
    if(randomNum<=popscaling){getTech=true;}

    var Message;
    var ImageLocation;

    if(getTech){
        //get a random tech that the user does not already have unlocked
        console.log("Calculating tech reward");
    }else{
        console.log("No tech reward, calculating resource reward");
        const resourceRand=Math.floor(Math.random() * 19);
        if(resourceRand<4){//gold boost
            const goldAmount=Math.round(30*Math.max(1,popscaling));
            Message="Traders bring wealth to your empire, you gain "+goldAmount.toString()+" gold";
            ImageLocation="Icons/TraderEvent.png"
        }else if(resourceRand<8 && resourceRand>=4){//stone boost
            const stoneAmount=Math.round(50*Math.max(1,popscaling));
            Message="Traders bring wealth to your empire, you gain "+stoneAmount.toString()+" Stone";
            ImageLocation="Icons/TraderEvent.png"
        }else if(resourceRand<12 && resourceRand>=8){//wood boost
            const woodAmount=Math.round(70*Math.max(1,popscaling));
            Message="Traders bring wealth to your empire, you gain "+woodAmount.toString()+" Wood";
            ImageLocation="Icons/TraderEvent.png"
        }else if(resourceRand<16 && resourceRand>=12){//manpower boost
            const PopAmount=Math.round(50*Math.max(1,popscaling));
            Message= PopAmount.toString() +" people come to your kingdom (+50 population), some already believe they've overstayed their welcome. -1% Stability";
            ImageLocation="Icons/traveling.png"
        }else if(resourceRand==16){//political power boost
            Message="The people have faith in your leadership, you gain 50 Political Power";
            ImageLocation="Icons/cheering.png"
        }else if(resourceRand==17){//stability boost
            Message="Consensus is that the good times are here to stay, you gain 1% Stability";
            ImageLocation="Icons/stabilityEvent.png"
        }else if(resourceRand==18){//war support boost
            Message="The people murmur a bit more about ambitions of expansion, you gain 1% War Support";
            ImageLocation="Icons/warSupportEvent.png";
        }else{}//nothing

    }
    return {Message:Message,ImageLocation:ImageLocation};
}
module.exports={calculateReward};