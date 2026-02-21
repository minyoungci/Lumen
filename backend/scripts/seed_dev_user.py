from uuid import UUID

from app.database import SessionLocal
from app.models.user import UserProfile

DEV_USER_ID = UUID("00000000-0000-0000-0000-000000000001")


def main() -> None:
    if SessionLocal is None:
        raise RuntimeError("Database not configured")

    db = SessionLocal()
    try:
        existing = db.query(UserProfile).filter(UserProfile.id == DEV_USER_ID).first()
        if existing:
            print("dev user already exists")
            return

        user = UserProfile(
            id=DEV_USER_ID,
            display_name="Dev Admin",
            role="admin",
            is_active=True,
        )
        db.add(user)
        db.commit()
        print("dev user created", DEV_USER_ID)
    finally:
        db.close()


if __name__ == "__main__":
    main()
