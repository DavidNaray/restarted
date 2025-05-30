const express=require("express");
const path = require('path')

const app=express()//creates server

app.use(express.static("./staticResources"))

//if i want to access index through sitePages, when commented out, if index.html in staticResources, gets it from there
//any errors in the future, potentially use path.resolve
app.get("/",(req,res)=>{
    res.status(200).sendFile(path.join(__dirname,'./sitePages/index.html'))
})

app.get("/about",(req,res)=>{
    res.status(200).send("aboutpage")
})

app.get('/{*any}',(req,res)=>{//handles urls not the explicitly defined, wanted ones
    res.status(200).send("pluh")
})

app.listen(5000,()=>{
    console.log("listening to port 5000")
})

//get (read), post (insert), put (update), delete (delete)