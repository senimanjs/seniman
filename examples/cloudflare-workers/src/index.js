import { useState } from 'seniman'; 
import { createServer } from 'seniman/workers';

function Body() {
  let [getCount, setCount] = useState(0);
  let onClick = () => setCount(count => count + 1);

  return <div>
    My counter: {getCount()}
    <button onClick={onClick}>Add +</button>
  </div>;
}

export default createServer({ Body });