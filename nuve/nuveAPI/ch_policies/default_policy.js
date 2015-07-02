/* 
Params
 
	room: room to which we need to assing a erizoController.
		{
		name: String, 
		[p2p: bool], 
		[data: Object], 
		_id: ObjectId
		}

	ec_list: array with erizo controller objects
		{
        ip: String,
        rpcID: String,
        state: Int,
        keepAlive: Int,
        hostname: String,
        port: Int,
        ssl: bool
   	 	}

   	ec_queue: array with erizo controllers priority according rooms load

Returns

	erizoControlerId: the key of the erizo controller selected from ec_list

*/
exports.getErizoController = function (room, ec_list, ec_queue) {
    
        var erizoControllerId = {};
        
        var ec_qlength = ec_queue.length;
        var ec_first = ec_queue[0];
        
        
        
    
        var eclist1_ip = ec_list[1].ip;
        var eclist1_rpcID = ec_list[1].rpcID;
        var eclist1_state = ec_list[1].state;
        var eclist1_keepAlive = ec_list[1].keepAlive;
        var eclist1_host = ec_list[1].hostname;
        var eclist1_port = ec_list[1].port;
        var eclist1_ssl = ec_list[1].ssl;
        
        if (ec_qlength > 1) {
        var ec_second = ec_queue[1];   
        var eclist2_ip = ec_list[2].ip;
        var eclist2_rpcID = ec_list[2].rpcID;
        var eclist2_state = ec_list[2].state;
        var eclist2_keepAlive = ec_list[2].keepAlive;
        var eclist2_host = ec_list[2].hostname;
        var eclist2_port = ec_list[2].port;
        var eclist2_ssl = ec_list[2].ssl;
        
//            if (room.name.indexOf("video_") === 0) {
//                
//            erizoControllerId = ec_queue[0];
//            } else {
//                erizoControllerId = ec_queue[1];
//            }
//        
//            
            
        } 
        
        
        
        erizoControllerId = ec_queue[0];
        
        
	
	return erizoControllerId;
}