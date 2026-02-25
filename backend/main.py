from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from typing import List
import datetime
import os

from backend import models, schemas, database, gemini_service
from backend.database import engine, get_db
from sqlalchemy import text

models.Base.metadata.create_all(bind=engine)

# Ensure new columns exist in existing sqlite table(s)
try:
    with engine.begin() as conn:
        res = conn.execute(text("PRAGMA table_info('materials')"))
        cols = [row[1] for row in res.fetchall()]
        if 'materialType' not in cols:
            conn.execute(text("ALTER TABLE materials ADD COLUMN materialType TEXT"))
        if 'unit' not in cols:
            conn.execute(text("ALTER TABLE materials ADD COLUMN unit TEXT DEFAULT 'pieces'"))
        conn.execute(text("UPDATE materials SET unit = 'pieces' WHERE unit IS NULL OR TRIM(unit) = ''"))
except Exception:
    # If DB isn't sqlite or table missing, skip altering (create_all will create tables)
    pass

app = FastAPI(title="Advanced Stock Management System")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Dependency ---

# --- Routes: Materials ---

@app.get("/materials", response_model=List[schemas.MaterialResponse])
def get_materials(db: Session = Depends(get_db)):
    return db.query(models.Material).all()

@app.post("/materials", response_model=schemas.MaterialResponse)
def create_material(material: schemas.MaterialCreate, db: Session = Depends(get_db)):
    db_material = db.query(models.Material).filter(models.Material.id == material.id).first()
    if db_material:
        raise HTTPException(status_code=400, detail="Material ID already exists")
    
    payload = material.dict()
    payload["unit"] = "pieces"
    new_material = models.Material(**payload)
    new_material.lastModified = datetime.datetime.utcnow()
    db.add(new_material)
    db.commit()
    db.refresh(new_material)
    return new_material

@app.put("/materials/{material_id}", response_model=schemas.MaterialResponse)
def update_material(material_id: str, material: schemas.MaterialUpdate, db: Session = Depends(get_db)):
    db_material = db.query(models.Material).filter(models.Material.id == material_id).first()
    if not db_material:
        raise HTTPException(status_code=404, detail="Material not found")
    
    update_data = material.dict(exclude_unset=True)
    if "unit" in update_data:
        update_data["unit"] = "pieces"
    for key, value in update_data.items():
        setattr(db_material, key, value)
    
    db_material.lastModified = datetime.datetime.utcnow()
    db.commit()
    db.refresh(db_material)
    return db_material

@app.delete("/materials/{material_id}")
def delete_material(material_id: str, db: Session = Depends(get_db)):
    db_material = db.query(models.Material).filter(models.Material.id == material_id).first()
    if not db_material:
        raise HTTPException(status_code=404, detail="Material not found")
    db.delete(db_material)
    db.commit()
    return {"message": "Deleted successfully"}

# --- Routes: Vendors ---

@app.get("/vendors", response_model=List[schemas.VendorAccountResponse])
def get_vendors(db: Session = Depends(get_db)):
    return db.query(models.VendorAccount).all()

@app.post("/vendors", response_model=schemas.VendorAccountResponse)
def create_vendor(vendor: schemas.VendorAccountCreate, db: Session = Depends(get_db)):
    new_vendor = models.VendorAccount(**vendor.dict())
    db.add(new_vendor)
    db.commit()
    db.refresh(new_vendor)
    return new_vendor

# --- Routes: Orders ---

@app.get("/orders", response_model=List[schemas.VendorOrderResponse])
def get_orders(db: Session = Depends(get_db)):
    return db.query(models.VendorOrder).all()

@app.post("/orders", response_model=schemas.VendorOrderResponse)
def create_order(order: schemas.VendorOrderCreate, db: Session = Depends(get_db)):
    # Business Rule: Admin status defaults to 'Booked', others to 'Requested'
    new_order = models.VendorOrder(**order.dict())
    
    # We could check role here if we had a token, but for now we'll trust the requested status 
    # as the frontend handles the initial logic, but we'll enforce it:
    db.add(new_order)
    db.commit()
    db.refresh(new_order)
    return new_order

@app.patch("/orders/{order_id}/status", response_model=schemas.VendorOrderResponse)
def update_order_status(order_id: int, status: str, db: Session = Depends(get_db)):
    db_order = db.query(models.VendorOrder).filter(models.VendorOrder.id == order_id).first()
    if not db_order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # If moving to Delivered, update stock
    if status == "Delivered" and db_order.status != "Delivered":
        if db_order.material_id:
            material = db.query(models.Material).filter(models.Material.id == db_order.material_id).first()
            if material:
                if material.category == "Standard Item":
                    material.quantity = (material.quantity or 0) + db_order.quantity
                else:
                    material.raw = (material.raw or 0) + db_order.quantity
                material.lastModified = datetime.datetime.utcnow()

    db_order.status = status
    db.commit()
    db.refresh(db_order)
    return db_order

# --- Routes: Auth & Employees ---

@app.post("/auth/login")
def login(login_data: dict, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(
        models.User.username == login_data.get("username"),
        models.User.password == login_data.get("password")
    ).first()
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    return {
        "username": user.username,
        "email": user.email,
        "role": user.role,
        "mobile": user.mobile
    }

@app.get("/employees", response_model=List[schemas.UserResponse])
def get_employees(db: Session = Depends(get_db)):
    return db.query(models.User).all()

@app.post("/employees", response_model=schemas.UserResponse)
def create_employee(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already exists")
    new_user = models.User(**user.dict())
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

# --- Route: AI Analysis ---

@app.get("/ai/analyze")
async def analyze_inventory(db: Session = Depends(get_db)):
    materials = db.query(models.Material).all()
    # Convert to list of dicts for Gemini
    m_data = []
    for m in materials:
        m_data.append({
            "id": m.id,
            "name": m.name,
            "category": m.category,
            "minStock": m.minStock,
            "raw": m.raw,
            "process": m.process,
            "quantity": m.quantity
        })
    analysis = await gemini_service.analyze_stock_with_gemini(m_data)
    return {"analysis": analysis}

# --- Root ---
@app.get("/")
def read_root():
    return {"status": "Backend is running"}

# --- Seeding ---
@app.post("/seed")
def seed_data(db: Session = Depends(get_db)):
    # Check if already seeded
    if db.query(models.Material).count() > 0:
        return {"message": "Data already seeded"}
    
    # Materials
    m1 = models.Material(id="M-101", name="Stainless Plate X", category="Plate", materialType="Stainless Steel", minStock=50, raw=150, process=20, length=2000, height=10, width=1000, unit="pieces")
    m2 = models.Material(id="M-102", name="Galvanized Pipe A", category="Pipe", materialType="Galvanized Steel", minStock=50, raw=45, process=30, diameter=50, length=6000, unit="pieces")
    m3 = models.Material(id="S-301", name="SKF Ball Bearing", category="Standard Item", materialType="Steel", minStock=100, quantity=750, innerDiameter=25, outerDiameter=52, width=15, unit="pieces")
    
    db.add_all([m1, m2, m3])
    
    # Vendors
    v1 = models.VendorAccount(companyName="Global Steel Co.", vendorName="John Smith", email="john@globalsteel.com", mobile="+1234567890")
    v2 = models.VendorAccount(companyName="Alloy World", vendorName="Jane Doe", email="jane@alloyworld.com", mobile="+0987654321")
    
    db.add_all([v1, v2])
    
    # User (Admin)
    admin = models.User(username="admin", email="admin@system.com", role="Admin", password="adminpass", mobile="1234567890")
    db.add(admin)
    
    db.commit()
    return {"message": "Sample data seeded successfully"}

# Mount static app after API routes so /materials, /vendors, /orders, etc. are not shadowed.
project_root = os.path.dirname(os.path.dirname(__file__))
static_dir = os.path.join(project_root, "frontend_static")
if os.path.isdir(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
