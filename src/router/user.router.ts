import { prisma } from "../lib/prisma";
import { FastifyInstance } from "fastify";
import { string, z } from "zod";
import { compare, hashSync } from "bcryptjs";
import { sign } from "jsonwebtoken";
import { authenticate } from "../plugins/authenticate";
import { hasRole } from "../plugins/hasRole";

interface IdParamUser {
  id: String;
}

export async function userController(fastify: FastifyInstance) {

  // ! rota para testar se a autenticação está funcionando
  fastify.get(
    "/ne",
    {
      onRequest: [authenticate, hasRole(["admin", "moderador"])],
    },
    async (request) => {
      return { user: request.user };
    }
  );

  // ! rota responsável por cadastrar novos usuários no banco doe dados
  fastify.post("/user/signup", async (request, reply) => {
    const addNewUser = z.object({
      email: z.string(),
      password: z.string(),
      admin: z.optional(z.string()),
    });

    const { email, password, admin } = addNewUser.parse(request.body);

    const hash = hashSync(password, 10);

    const findUser = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (!findUser) {
      const newUser = await prisma.user.create({
        data: {
          email,
          password: hash,
          admin,
        },
      });
      return { newUser };
    } else {
      reply.status(401).send({
        failed: "Error! verifique seus dados e tente novamente",
      });
    }
  });

  // ! rota responsável por fazer o login dos usuários
  fastify.post("/user/signin", (request, reply) => {
    const loginUserValidation = z.object({
      email: z.string(),
      password: z.string(),
    });

    const { email, password } = loginUserValidation.parse(request.body);

    const findUser = prisma.user
      .findUnique({
        where: {
          email,
        },
      })
      .then((user) => {
        compare(password, user.password, (error, result) => {
          if (result) {
            const token = sign(
              {
                email: user.email,
                id: user.id,
                admin: user.admin,
              },
              process.env.TOKEN_KEY,
              {
                expiresIn: "2h",
              }
            );

            reply.status(201).send({
              sucess: "Login realizado com sucesso",
              token: token,
            });

            user.token = token;
          } else {
            reply.send({
              failed: error,
            });
          }
        });
      });
  });

  // ! rota para atualizar e editar registro de usuários
  fastify.put<{ Params: IdParamUser }>(
    "/user/update/:id",
    { onRequest: [authenticate, hasRole(["admin"])] },
    async (request, reply) => {
      const { id } = request.params;
      const userUpdateValidation = z.object({
        admin: z.string(),
      });

      const { admin } = userUpdateValidation.parse(request.body);

      const findUserForUpdate = await prisma.user.findUnique({
        where: {
          id: String(id),
        },
      });

      if (!findUserForUpdate) {
        reply.status(401).send({
          failed: "Membro não encontrado ou não existe",
        });
      } else {
        const result = await prisma.user.update({
          where: {
            id: String(id),
          },
          data: {
            admin,
          },
        });
        reply.status(200).send({
          success: "Usuário atualizado com sucesso",
          content: result,
        });
      }
    }
  );
}
