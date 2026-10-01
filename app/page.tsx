import { readFileSync } from "node:fs";
import { join } from "node:path";
import Hero from "@/components/Hero";
import Palletizer from "@/components/Palletizer";
import Projects from "@/components/Projects";

export default function Home() {
  return (
    <>
      <Hero
        controllerSource={readFileSync(join(process.cwd(), "public/letter-controller.cpp"), "utf8")}
        simulationSource={readFileSync(join(process.cwd(), "components/Hero.tsx"), "utf8")}
      />
      <main>
        <Palletizer />
        <Projects />
      </main>
    </>
  );
}
