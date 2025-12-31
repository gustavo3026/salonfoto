from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
import uvicorn
import base64
from engine import engine

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {"status": "ok", "model": "RMBG-1.4"}

@app.post("/process")
async def process_image(
    file: UploadFile = File(...),
    task: str = Form(...),
    instruction: str = Form(None)
):
    print(f"Processing task: {task}")
    contents = await file.read()
    
    try:
        # Currently only supporting 'REMOVE_BG' logic fully via specific engine pipeline
        # 'EDIT' logic currently falls back to the same pipeline if we don't have a GenAI model locally.
        # The Master Prompt for 'BatchBG-Python' mainly specified the specific robust segmentation pipeline.
        # If user wants edits (restorations/erasures), that would be bitwise ops on the frontend or separate endpoint.
        # For now, we map everything to the engine's main process which produces the clean catalog shot.
        
        output_bytes = engine.process_image(contents, task=task, instruction=instruction)
        
        # Return as image/png
        return Response(content=output_bytes, media_type="image/png")
        
    except Exception as e:
        print(f"Error: {e}")
        return {"error": str(e)}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
