const http=require("http")

const server=http.createServer((request,response) =>{
    if(request.url==="/"){
        // response.write("hello")
        response.end("home");
    }
    else if(request.url==="/about"){
        // response.write("about")
        response.end("about");
    }else{
        response.end("no such page");
    }
    
})

server.listen(5000)