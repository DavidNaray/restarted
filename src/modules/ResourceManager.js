const ChunkManager=require("./CacheChunkInfo.js")
// const TickManager=require("./TickManager.js")

class ResourceManager {

    constructor() {}

    async getUserResources(UserId){
        const user=await ChunkManager.getUser(UserId)
        if(!user) {console.log(`No user found for playerId: ${UserId}`);return;}
        // console.log("user man",user)
        await this.updateResourceForUser(user);
        return user.Resources;
    }

    async updateResourceForUser(user){
        // console.log("updating resources for user",user.id,user.Resources.lastUpdated)
        const now = Date.now();
        const last = new Date(user.Resources.lastUpdated);
        const elapsedSeconds = (now - last.getTime()) / 1000;

        // console.log("update user:", user)
        for (const key of ["Gold", "Stone", "Wood", "Political"]) {
            const resource = user.Resources[key];
            if (resource.Rate !== 0) {
                resource.Total += resource.Rate * elapsedSeconds;
            }
        }

        const mp = user.Resources.ManPower;
        if (mp.PopulationRate !== 0) {
            mp.TotalPopulation += mp.PopulationRate * elapsedSeconds;
            if (mp.TotalPopulation > mp.MaxPopulation) {
                mp.TotalPopulation = mp.MaxPopulation;
            }
            mp.TotalManPower = Math.floor(mp.TotalPopulation * mp.RecruitableFactor);
        }
        user.Resources.lastUpdated = Date.now();
    }

}

module.exports=new ResourceManager()