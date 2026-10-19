import { Router } from "express";
import { db } from "@db";
import { invitations, users } from "@db/schema";
import { eq, and } from "drizzle-orm";
import { hashPassword } from "./auth";

// Create a specialized router for invitation-related endpoints
const invitationRouter = Router();

// Validate an invitation (public endpoint for checking token validity)
invitationRouter.get("/validate/:token", async (req, res) => {
  try {
    const { token } = req.params;
    console.log("Invitation validation request received for token:", token);
    
    // Validate token format - tokens must be valid UUIDs
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(token)) {
      console.log("Invalid UUID format for token:", token);
      return res.status(400).json({ 
        message: "Invalid invitation token format",
        status: 'invalid'
      });
    }
    
    // Find the invitation by token
    const [invitation] = await db
      .select()
      .from(invitations)
      .where(eq(invitations.token, token))
      .limit(1);

    if (!invitation) {
      console.log("Invitation not found for token:", token);
      return res.status(404).json({ 
        message: "Invitation not found",
        status: 'invalid'
      });
    }

    // Check if the invitation is still valid
    if (invitation.status !== 'pending') {
      console.log(`Invitation status is ${invitation.status} for token:`, token);
      return res.status(400).json({ 
        message: `Invitation is ${invitation.status}`,
        status: invitation.status
      });
    }

    const currentDate = new Date();
    if (new Date(invitation.expiresAt) < currentDate) {
      // Update invitation status to expired
      console.log("Invitation has expired for token:", token);
      await db
        .update(invitations)
        .set({
          status: 'expired',
        })
        .where(eq(invitations.id, invitation.id));
        
      return res.status(400).json({ 
        message: "Invitation has expired",
        status: 'expired',
        expiresAt: invitation.expiresAt
      });
    }

    // Return invitation data (excluding sensitive fields)
    const { token: _, ...cleanInvitation } = invitation;
    console.log("Valid invitation found for token:", token);
    res.json({
      email: cleanInvitation.email,
      phone: cleanInvitation.phone,
      role: cleanInvitation.role,
      status: cleanInvitation.status,
      expiresAt: cleanInvitation.expiresAt
    });
  } catch (error) {
    console.error("Error validating invitation:", error);
    res.status(500).json({ message: "Failed to validate invitation" });
  }
});

// Accept an invitation (public endpoint with token validation)
invitationRouter.post("/accept/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const { username, password, email } = req.body;
    console.log("Invitation acceptance request received for token:", token);

    // Validate token format - tokens must be valid UUIDs
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(token)) {
      console.log("Invalid UUID format for token:", token);
      return res.status(400).json({ 
        message: "Invalid invitation token format",
        status: 'invalid'
      });
    }
    
    // Find the invitation
    const [invitation] = await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.token, token),
          eq(invitations.status, 'pending')
        )
      )
      .limit(1);

    if (!invitation) {
      console.log("Invalid or expired invitation for token:", token);
      return res.status(404).json({ message: "Invalid or expired invitation" });
    }

    // Check if invitation has expired
    if (new Date(invitation.expiresAt) < new Date()) {
      console.log("Invitation has expired for token:", token);
      await db
        .update(invitations)
        .set({ status: 'expired' })
        .where(eq(invitations.id, invitation.id));
        
      return res.status(400).json({ message: "This invitation has expired" });
    }

    // Check if username is already taken
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (existingUser) {
      console.log("Username already exists:", username);
      return res.status(400).json({ message: "Username is already taken" });
    }

    // Create the new user
    const hashedPassword = await hashPassword(password);
    const emailToUse = email || invitation.email;

    const [newUser] = await db
      .insert(users)
      .values({
        username,
        password: hashedPassword,
        email: emailToUse,
        role: invitation.role,
        vendorId: invitation.vendorId,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();

    // Mark invitation as accepted
    await db
      .update(invitations)
      .set({
        status: 'accepted',
        acceptedAt: new Date(),
        acceptedByUserId: newUser.id
      })
      .where(eq(invitations.id, invitation.id));

    console.log("Invitation accepted successfully for token:", token);
    res.status(201).json({
      message: "Invitation accepted successfully",
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role
      }
    });
  } catch (error) {
    console.error("Error accepting invitation:", error);
    
    // Check for specific error types to provide better error messages
    if (error.code === '23505') { // Unique constraint violation
      if (error.detail && error.detail.includes('email')) {
        return res.status(400).json({ 
          message: "This email address is already registered in the system. Please use a different email or contact your administrator.",
          errorType: "duplicate_email"
        });
      }
      if (error.detail && error.detail.includes('username')) {
        return res.status(400).json({ 
          message: "This username is already taken. Please choose a different username.",
          errorType: "duplicate_username" 
        });
      }
      // Generic constraint error
      return res.status(400).json({ 
        message: "This account cannot be created due to a conflict with existing data. Please try different information.",
        errorType: "duplicate_data"
      });
    }
    
    // Generic server error
    res.status(500).json({ 
      message: "Failed to accept invitation. Server error occurred.",
      errorType: "server_error"
    });
  }
});

export default invitationRouter;