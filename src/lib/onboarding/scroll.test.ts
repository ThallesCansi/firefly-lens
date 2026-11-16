import {afterEach,expect,it,vi} from "vitest";
import {scrollTourTo} from "./scroll";

afterEach(()=>vi.unstubAllGlobals());
function setup(reduced=false) {
  const frames=new Map<number,FrameRequestCallback>();let next=0;
  const view={scrollY:0,innerHeight:1000,scrollTo:vi.fn(({top}:{top:number})=>{view.scrollY=top;})};
  vi.stubGlobal("window",view);vi.stubGlobal("document",{documentElement:{scrollHeight:2000}});
  vi.stubGlobal("matchMedia",()=>({matches:reduced}));vi.stubGlobal("performance",{now:()=>0});
  vi.stubGlobal("requestAnimationFrame",(fn:FrameRequestCallback)=>{frames.set(++next,fn);return next;});
  vi.stubGlobal("cancelAnimationFrame",(id:number)=>frames.delete(id));
  const tick=(time:number)=>{const batch=[...frames.values()];frames.clear();batch.forEach(fn=>fn(time));};
  return {view,frames,tick};
}
it("passes through intermediate positions and finishes before the next highlight",async()=>{
  const {view,tick}=setup();const done=vi.fn();
  const scroll=scrollTourTo(1500,new AbortController().signal).then(done);
  tick(225);expect(view.scrollY).toBe(500);expect(done).not.toHaveBeenCalled();
  tick(450);await scroll;expect(view.scrollY).toBe(1000);expect(done).toHaveBeenCalledOnce();
});
it("cancels an in-flight scroll when the tour exits or changes direction",async()=>{
  const {view,frames,tick}=setup();const controller=new AbortController();
  const scroll=scrollTourTo(1000,controller.signal);tick(100);const stopped=view.scrollY;
  controller.abort();await expect(scroll).rejects.toMatchObject({name:"AbortError"});
  expect(frames.size).toBe(0);tick(450);expect(view.scrollY).toBe(stopped);
});
it("respects reduced motion and does not scroll for an already cancelled step",async()=>{
  const {view,frames}=setup(true);await scrollTourTo(800,new AbortController().signal);
  expect(view.scrollY).toBe(800);expect(frames.size).toBe(0);
  const controller=new AbortController();controller.abort();
  await expect(scrollTourTo(0,controller.signal)).rejects.toMatchObject({name:"AbortError"});
  expect(view.scrollY).toBe(800);
});
