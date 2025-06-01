const http = require('http');
const express=require("express");
const path = require('path')
const { Server } = require('socket.io');
const { RTCPeerConnection, RTCSessionDescription } = require('wrtc');

const app=express()//creates server
const server = http.createServer(app);
const io = new Server(server);


app.use(express.static("./staticResources"))


app.get("/",(req,res)=>{
    //if i want to access index through sitePages, when commented out, if index.html in staticResources, gets it from there
    //any errors in the future, potentially use path.resolve
    res.status(200).sendFile(path.join(__dirname,'./sitePages/index.html'))
})

// app.get("/about",(req,res)=>{res.status(200).send("aboutpage")})

app.get('/{*any}',(req,res)=>{//handles urls not the explicitly defined, wanted ones
    res.status(200).send("pluh")
})

server.listen(5000,()=>{
    console.log("listening to port 5000")
})

//users join a room and then establish a connection with users in that room
//for this app users will establish one on one peer to peer connection
//from the server you get your data, tiles, objects, quantities but only yours

const socketToRooms  = new Map();//{}; // roomId -> array of sockets

io.on('connection', socket => {
    // console.log('a user connected');
    socket.on('join', roomId => {
        console.log(`user connected ${roomId}`)

        const room = io.sockets.adapter.rooms.get(roomId) || new Set();
        const numClients = room.size;

        
        if (numClients < 2) {
            socket.join(roomId);

            if (!socketToRooms.has(socket.id)) {
                socketToRooms.set(socket.id, new Set());
            }
            socketToRooms.get(socket.id).add(roomId);

            socket.emit('joined', roomId);

            const updatedRoom = io.sockets.adapter.rooms.get(roomId);
            if (updatedRoom && updatedRoom.size === 2) {
                const [firstId, secondId] = [...updatedRoom];
                const initiatorId = secondId; // the newer client
                const receiverId = firstId;

                io.to(initiatorId).emit('ready', { roomId, initiator: true });
                io.to(receiverId).emit('ready', { roomId, initiator: false });
            }

        } else {
            socket.emit('room-full', roomId);
        }

    });


    socket.on('offer', ({ roomId, offer }) => {
        socket.to(roomId).emit('offer', { roomId, offer });
        // socket.to(data.room).emit('offer', data.offer);
        // socket.broadcast.emit('offer', data);
    });

    socket.on('answer', ({ roomId, answer }) => {
        socket.to(roomId).emit('answer', { roomId, answer });
        // socket.to(data.room).emit('answer', data.answer);
        // socket.broadcast.emit('answer', data);
    });

    socket.on('ice-candidate', ({ roomId, candidate }) => {
        socket.to(roomId).emit('ice-candidate', { roomId, candidate });
        // socket.broadcast.emit('ice-candidate', data);
    });

    socket.on('disconnect', () => {
            console.log('user disconnected');
            // Get all rooms socket was in
            const rooms = socketToRooms.get(socket.id) || new Set(); // Set including socket.id itself
            rooms.forEach(roomId => {
                setTimeout(() => {
                    const room = io.sockets.adapter.rooms.get(roomId);
                    
                    if (!room || room.size < 2) {

                        console.log(`[Server] Notifying room ${roomId} that peer left`);
                        socket.to(roomId).emit('peer-left', roomId);


                        if (!room || room.size < 2) {
                            for (const socketId of room || []) {
                                //kicks the remaining peer out the room
                                io.sockets.sockets.get(socketId)?.leave(roomId);
                                //notifies them that the room is closed and to not try to reconnect
                                io.sockets.sockets.get(socketId)?.emit('room-closed', roomId);  // Explicit event for remaining client
                            }
                        }
                    }else {
                        console.log(`[Server] Room ${roomId} still active, skipping cleanup`);
                    }
                },1000);
            });
            socketToRooms.delete(socket.id);
    });


});