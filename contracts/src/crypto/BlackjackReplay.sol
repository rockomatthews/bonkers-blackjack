// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
/// @notice Deterministic six-deck replay candidate. Unaudited; private testing only.
library BlackjackReplay {
    struct Hand {uint16[22] cards; uint8 count; uint8 multiplier; bool split; bool splitAce; bool done;}
    struct Seat {Hand[4] hands; uint8 count; uint8 active;}
    struct State {Seat[7] seats; uint16[22] dealer; uint8 dealerCount; uint8 active; uint8 players; uint16 cursor; bool done;}
    struct Action {uint8 seat; uint8 move;}
    function deck(bytes32 seed,bytes32 entropy) internal pure returns(uint16[312] memory cards){
        for(uint16 i=0;i<312;i++)cards[i]=i;
        for(uint256 i=311;i>0;i--){uint256 j=uint256(keccak256(abi.encode(seed,entropy,i)))%(i+1);(cards[i],cards[j])=(cards[j],cards[i]);}
    }
    function rank(uint16 card) internal pure returns(uint8){return uint8(card%13)+1;}
    function total(uint16[22] memory cards,uint8 count) internal pure returns(uint8 value){
        uint8 aces;for(uint8 i=0;i<count;i++){uint8 r=rank(cards[i]);if(r==1){aces++;value+=11;}else value+=r>10?10:r;}
        while(value>21&&aces>0){value-=10;aces--;}
    }
    function draw(Hand memory h,uint16[312] memory cards,State memory s) private pure {require(h.count<22&&s.cursor<312,"deck bound");h.cards[h.count++]=cards[s.cursor++];}
    function next(State memory s,uint16[312] memory cards) private pure {
        while(s.active<s.players){Seat memory p=s.seats[s.active];while(p.active<p.count&&p.hands[p.active].done)p.active++;if(p.active<p.count)return;s.active++;}
        while(total(s.dealer,s.dealerCount)<17){require(s.dealerCount<22,"dealer bound");s.dealer[s.dealerCount++]=cards[s.cursor++];}
        s.done=true;
    }
    function initial(uint16[312] memory cards,uint8 players) internal pure returns(State memory s){
        require(players>0&&players<=7,"players");s.players=players;
        for(uint8 i=0;i<players;i++){s.seats[i].count=1;s.seats[i].hands[0].multiplier=1;draw(s.seats[i].hands[0],cards,s);}
        s.dealer[s.dealerCount++]=cards[s.cursor++];
        for(uint8 i=0;i<players;i++)draw(s.seats[i].hands[0],cards,s);
        s.dealer[s.dealerCount++]=cards[s.cursor++];
        if(total(s.dealer,2)==21){s.done=true;s.active=players;return s;}
        for(uint8 i=0;i<players;i++)if(total(s.seats[i].hands[0].cards,2)==21)s.seats[i].hands[0].done=true;
        next(s,cards);
    }
    // Canonical bytes reveal the hole only after decisions finish. Hash binds every visible card/hand/turn.
    function observation(State memory s) internal pure returns(bytes memory out){
        out=abi.encodePacked(uint8(1),s.done,s.active,s.players,s.done?s.dealerCount:uint8(1));
        for(uint8 i=0;i<(s.done?s.dealerCount:1);i++)out=bytes.concat(out,bytes2(s.dealer[i]));
        for(uint8 i=0;i<s.players;i++){
            Seat memory p=s.seats[i];out=bytes.concat(out,bytes1(p.count),bytes1(p.active));
            for(uint8 j=0;j<p.count;j++){Hand memory h=p.hands[j];out=bytes.concat(out,bytes1(h.count),bytes1(h.multiplier),h.split?bytes1(0x01):bytes1(0),h.splitAce?bytes1(0x01):bytes1(0),h.done?bytes1(0x01):bytes1(0));for(uint8 k=0;k<h.count;k++)out=bytes.concat(out,bytes2(h.cards[k]));}
        }
    }
    /// Parse the committed public snapshot to prevent a player submitting an illegal move
    /// and deliberately making replay fail in order to collect failure collateral.
    function legalMoves(bytes memory data) internal pure returns(uint8 mask){
        require(data.length>=5 && uint8(data[0])==1 && uint8(data[1])==0,"live snapshot");
        uint8 active=uint8(data[2]);uint8 players=uint8(data[3]);
        require(players>0&&players<=7&&active<players&&uint8(data[4])==1,"snapshot header");
        uint256 at=7;
        for(uint8 i=0;i<players;i++){
            require(at+2<=data.length,"snapshot length");uint8 count=uint8(data[at++]);uint8 current=uint8(data[at++]);
            require(count>0&&count<=4&&current<=count,"snapshot hands");
            for(uint8 j=0;j<count;j++){
                require(at+5<=data.length,"snapshot hand");uint8 n=uint8(data[at]);uint8 mult=uint8(data[at+1]);bool ace=data[at+3]==0x01;bool done=data[at+4]==0x01;
                require(n>=2&&n<=22&&(mult==1||mult==2),"snapshot hand values");at+=5;
                require(at+uint256(n)*2<=data.length,"snapshot cards");
                if(i==active&&j==current){
                    require(!done,"finished hand");mask=4; // stand = bit 2
                    if(!ace){mask|=2;if(n==2&&mult==1){mask|=8;uint16 a=(uint16(uint8(data[at]))<<8)|uint8(data[at+1]);uint16 b=(uint16(uint8(data[at+2]))<<8)|uint8(data[at+3]);if(count<4&&rank(a)==rank(b))mask|=16;}}
                }
                at+=uint256(n)*2;
            }
        }
        require(at==data.length&&mask!=0,"snapshot trailing bytes");
    }
    function step(State memory s,uint16[312] memory cards,Action memory a) internal pure returns(uint8 extra){
        require(!s.done&&a.seat==s.active,"wrong turn");Seat memory p=s.seats[s.active];Hand memory h=p.hands[p.active];
        if(a.move==1){require(!h.splitAce,"split ace");draw(h,cards,s);if(total(h.cards,h.count)>=21)h.done=true;}
        else if(a.move==2)h.done=true;
        else if(a.move==3){require(h.count==2&&!h.splitAce,"double");extra=h.multiplier;h.multiplier*=2;draw(h,cards,s);h.done=true;}
        else if(a.move==4){
            require(h.count==2&&!h.splitAce&&p.count<4&&rank(h.cards[0])==rank(h.cards[1]),"split");extra=h.multiplier;
            // Insert the new hand immediately after the active hand, preserving play order.
            for(uint8 j=p.count;j>p.active+1;j--)p.hands[j]=p.hands[j-1];
            Hand memory sibling; sibling.cards[0]=h.cards[1];sibling.count=1;sibling.multiplier=h.multiplier;sibling.split=true;sibling.splitAce=rank(h.cards[0])==1;
            h.count=1;h.cards[1]=0;h.split=true;h.splitAce=sibling.splitAce;
            draw(h,cards,s);draw(sibling,cards,s);h.done=h.splitAce||total(h.cards,h.count)==21;sibling.done=sibling.splitAce||total(sibling.cards,sibling.count)==21;
            p.hands[p.active+1]=sibling;p.count++;
        }else revert("action");
        next(s,cards);
    }
    function payouts(State memory s,uint128[] memory stakes) internal pure returns(uint128[] memory result){
        require(s.done,"unfinished");result=new uint128[](s.players);uint8 dealer=total(s.dealer,s.dealerCount);bool dealerBJ=dealer==21&&s.dealerCount==2;
        for(uint8 i=0;i<s.players;i++)for(uint8 j=0;j<s.seats[i].count;j++){
            Hand memory h=s.seats[i].hands[j];uint8 value=total(h.cards,h.count);uint128 stake=stakes[i]*h.multiplier;
            bool natural=!h.split&&h.count==2&&value==21;
            if(value>21)continue;
            if(dealerBJ){if(natural)result[i]+=stake;}
            else if(natural)result[i]+=stake*5/2;
            else if(dealer>21||value>dealer)result[i]+=stake*2;
            else if(value==dealer)result[i]+=stake;
        }
    }
    function verify(bytes32 seed,bytes32 entropy,uint128[] memory stakes,Action[] memory actions,bytes32[] memory observations,uint128[] memory added) internal pure returns(uint128[] memory){
        require(actions.length<=512&&observations.length==actions.length+1&&added.length==stakes.length,"transcript bound");
        uint16[312] memory cards=deck(seed,entropy);State memory s=initial(cards,uint8(stakes.length));uint128[] memory extras=new uint128[](stakes.length);
        for(uint256 i=0;i<actions.length;i++){require(keccak256(observation(s))==observations[i],"altered observation");uint8 extra=step(s,cards,actions[i]);extras[actions[i].seat]+=stakes[actions[i].seat]*extra;}
        require(keccak256(observation(s))==observations[actions.length],"altered final observation");
        for(uint8 i=0;i<stakes.length;i++)require(extras[i]==added[i],"stake mismatch");
        return payouts(s,stakes);
    }
}
