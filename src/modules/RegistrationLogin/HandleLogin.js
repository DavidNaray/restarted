const bcrypt = require('bcrypt');
const {RefreshTokenImport,AccessTokenImport}=require("../Verification")
const {toCachedUser}=require("../MongoAbstractConversions")
async function HandleLogin(ChunkManager,User,username,password){
    try {

        const user = await User.findOne({ username });
        if (!user) { return "NoUser";}

        const passwordMatch = await bcrypt.compare(password, user.passwordHash);
        if (!passwordMatch) {return "WrongPass"}

        const accessToken = AccessTokenImport(user)
        const refreshToken = RefreshTokenImport(user)

        //save the refresh token in DB
        user.refreshTokens.push(refreshToken);
        await user.save();

        const UserToCacheConverted = await toCachedUser(user)
        await ChunkManager.RegisterUser(UserToCacheConverted.id,UserToCacheConverted)

        console.log("Login of user:", username);

        return {"RT":refreshToken,"AT":accessToken,"user":user}


    }catch(err){
        console.error(err);
        return "ServerFail";
    }
}


module.exports={HandleLogin}