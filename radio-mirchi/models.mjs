export function eventModel({capacity,occupancy,ticket,sponsor,ancillary,fixed,variable}){
 const attendees=Math.round(capacity*occupancy/100),unit=ticket-variable;
 const revenue=attendees*ticket+sponsor+ancillary,cost=fixed+attendees*variable;
 const contribution=revenue-cost,gap=Math.max(0,fixed-sponsor-ancillary);
 const breakEven=gap===0?0:unit>0?Math.ceil(gap/unit):null;
 return {attendees,unit,revenue,cost,contribution,margin:revenue>0?contribution/revenue*100:null,breakEven,withinCapacity:breakEven!==null&&breakEven<=capacity};
}
export function subscriberModel({people,price,retention,costshare,service,cac}){
 const unit=price*(1-costshare/100)-service;
 const renewed=Math.round(people*retention/100);
 return {unit,revenue:people*price,firstYear:people*(unit-cac),renewed,renewalContribution:renewed*unit,paybackMonths:unit>0?cac/(unit/12):null};
}
export function radioModel({seconds,utilisation,yield:rate,newutil,discount}){
 const baseline=seconds*utilisation/100*rate;
 const alternative=seconds*newutil/100*rate*(1-discount/100);
 const required = baseline === 0 ? 0 : discount < 100 ? utilisation / (1 - discount / 100) : null;
 return{baseline,alternative,delta:alternative-baseline,change:baseline>0?(alternative/baseline-1)*100:null,required};
}
