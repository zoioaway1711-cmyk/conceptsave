export const rankStarts=[0,10,20,30,50];
const discount=(percent:number)=>({title:`${percent}% de desconto`,description:`${percent}% de desconto em um pedido. Não cumulativo com outros descontos, inclusive o vitalício. Solicite ao vendedor.`});
const lifetime=(percent:number)=>({title:`${percent}% de desconto vitalício`,description:`Após a confirmação do vendedor, ${percent}% de desconto nos pedidos futuros. Os percentuais vitalícios não se somam: vale o maior confirmado, até 10%. Não cumulativo com outros descontos.`});
const shipping={title:'Envio grátis',description:'Um envio gratuito, mediante confirmação do vendedor.'};
const catalog=[
 [shipping,discount(10),discount(15)],
 [shipping,discount(15),discount(20)],
 [lifetime(5),discount(20),discount(25)],
 [lifetime(7),discount(25),discount(30)],
 [lifetime(10),discount(30),{title:'1 produto grátis',description:'Um produto gratuito, uma única vez neste nível. Combine com o vendedor o produto e a entrega; não cumulativo com outra promoção.'}],
];
export function rewardCatalog(rank:number) {
 const rewards=catalog[rank-1] || catalog[0];
 return rewards.map((reward,index)=>({threshold:[3,5,10][index],...reward}));
}
