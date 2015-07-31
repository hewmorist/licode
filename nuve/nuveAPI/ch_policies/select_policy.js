var _ = require('underscore');

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
	
           var roomType = {};
           
            var erizoControllerId = {};
            
            var prefix = room.name.split("_")[0];
            
            if(prefix === "webinar"){
                roomType = "webinar";
            } else if (prefix === "video") {
                roomType = "personal";
            } else {
                roomType = "netgroup";
            }
         
            var qlength = ec_queue.length;
            
            var ec_LondonVm = _.findWhere(ec_list,{ip:"37.130.230.249"});
            var ec_UtahV1 = _.findWhere(ec_list,{ip:"67.212.234.124"});
            var ec_UtahV3 = _.findWhere(ec_list,{ip:"206.190.131.204"});
            var ec_LocalV1 = _.findWhere(ec_list,{ip:"10.0.0.36"});
            
            if (qlength > 1) {
                
                    if(roomType === "webinar" && ec_UtahV3 !== undefined){
                        erizoControllerId = ec_UtahV3.rpcID.split("_")[1];
                    } else if(roomType === "webinar" && ec_UtahV1 !== undefined){
                        erizoControllerId = ec_UtahV1.rpcID.split("_")[1];
                    } else if(roomType === "webinar" && ec_LondonVm !== undefined){
                        erizoControllerId = ec_LondonVm.rpcID.split("_")[1];
                    } else if(roomType === "netgroup" && ec_UtahV1 !== undefined){
                        erizoControllerId = ec_UtahV1.rpcID.split("_")[1];
                    } else if(roomType === "netgroup" && ec_LondonVm !== undefined){
                        erizoControllerId = ec_LondonVm.rpcID.split("_")[1];
                    } else if(roomType === "personal" && ec_LondonVm !== undefined){
                        erizoControllerId = ec_UtahV1.rpcID.split("_")[1];
                    }  else if(roomType === "personal" && ec_UtahV1 !== undefined){
                        erizoControllerId = ec_UtahV1.rpcID.split("_")[1];
                    } else {
                        erizoControllerId = ec_queue[0];
                    }      
                               
                
            } else {
                erizoControllerId = ec_queue[0]; 
            }
            
            
                  
        
	return erizoControllerId;
}
