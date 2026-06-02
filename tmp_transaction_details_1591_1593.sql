select
  td.id,
  td."transactionId",
  td."transactionPaidId",
  td."conceptId",
  c.name as concept_name,
  td.quantity,
  td.total
from "transactionDetails" td
left join concepts c on c.id = td."conceptId"
where td."transactionId" in (1591, 1592, 1593)
   or td."transactionPaidId" in (1591, 1592, 1593)
order by td."transactionId", td.id;
