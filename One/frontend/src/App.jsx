import { useEffect, useState } from "react";
import "./App.css";
import axios from "axios";

function App() {
  const [jokes, setJokes] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const response = await axios.get("/api/jokes");
        setJokes(response.data);
      } catch (error) {
        console.log("Error : ", error);
      }
    })();
  }, []);

  return (
    <>
      <h1>Hello Vite + React!</h1>
      <h2>Total jokes : {jokes.length}</h2>

      {jokes.map((item) => (
        <div key={item.id}>
          <p>
            {item.name} - {item.email}
          </p>
        </div>
      ))}
    </>
  );
}

export default App;
